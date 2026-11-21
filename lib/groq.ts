import type { ChatMessage, ModelReply, ToolSpec } from "@/lib/chat";
import { readChatStream } from "@/lib/groq-stream";
import { toStrictJsonSchema, type Message } from "@/lib/extract-job";

const MODEL = "openai/gpt-oss-120b";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

// Per call. extractWithRetry makes at most 2 calls, so the worst case (~24s) stays under the
// route's maxDuration of 30s: a stuck call fails fast as OUR 503, instead of the platform killing the function.
export const GROQ_TIMEOUT_MS = 12_000;

/**
 * Error from the Groq API. The message is only the status: Groq's response body can contain the
 * model's output (derived from the user's posting), so it lives in `detail` and must never be
 * logged or sent to a client. Scripts may print `detail` when debugging.
 */
export class GroqError extends Error {
  constructor(public status: number, public detail: string) {
    super(`Groq API error ${status}`);
    this.name = "GroqError";
  }
}

// Structured outputs (json_schema, strict) are documented for gpt-oss-120b. If the API rejects
// that format with a 400, fall back ONCE to json_object mode (the zod check + retry still guard it).
let useJsonObject = false;
export const groqMode = () => (useJsonObject ? "json_object (fallback)" : "json_schema strict");

export async function callGroq(messages: Message[]): Promise<string> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("GROQ_API_KEY is missing. Add it to .env.local.");

  const send = (jsonObject: boolean) => {
    const msgs = jsonObject
      ? [{ ...messages[0], content: `${messages[0].content}\n\nReturn ONLY a JSON object matching this JSON Schema:\n${JSON.stringify(toStrictJsonSchema())}` }, ...messages.slice(1)]
      : messages;
    return fetch(GROQ_URL, {
      method: "POST",
      signal: AbortSignal.timeout(GROQ_TIMEOUT_MS),
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0,
        messages: msgs,
        response_format: jsonObject
          ? { type: "json_object" }
          : { type: "json_schema", json_schema: { name: "job_extraction", strict: true, schema: toStrictJsonSchema() } },
      }),
    });
  };

  let res = await send(useJsonObject);
  if (res.status === 400 && !useJsonObject) {
    const detail = await res.text();
    if (/response_format|json_schema|schema/i.test(detail)) {
      useJsonObject = true;
      res = await send(true);
    } else {
      throw new GroqError(400, detail.slice(0, 300));
    }
  }
  if (!res.ok) throw new GroqError(res.status, (await res.text()).slice(0, 300));

  const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new Error("Groq returned no content.");
  return content;
}

/** Test helper: makes the FIRST call return broken JSON (no API call), so the retry path runs for real. */
export function withBrokenFirstCall(call: (m: Message[]) => Promise<string>) {
  let first = true;
  return async (m: Message[]) => {
    if (first) {
      first = false;
      return '{"company": "Acme", "role": ';
    }
    return call(m);
  };
}

/**
 * Chat with tools. Separate from callGroq: Groq does not combine tool use with structured outputs
 * (json_schema), so this call sends `tools` and returns the whole assistant message (tool_calls included).
 */
const chatBody = (messages: ChatMessage[], tools: ToolSpec[], extra: object = {}) =>
  JSON.stringify({
    model: MODEL,
    temperature: 0,
    messages,
    tools: tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.parameters } })),
    tool_choice: "auto",
    ...extra,
  });

export async function callGroqChat(messages: ChatMessage[], tools: ToolSpec[]): Promise<ModelReply> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("GROQ_API_KEY is missing. Add it to .env.local.");

  const res = await fetch(GROQ_URL, {
    method: "POST",
    signal: AbortSignal.timeout(GROQ_TIMEOUT_MS),
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: chatBody(messages, tools),
  });
  if (!res.ok) throw new GroqError(res.status, (await res.text()).slice(0, 300));

  const body = (await res.json()) as { choices?: { message?: ModelReply }[] };
  const message = body.choices?.[0]?.message;
  if (!message) throw new Error("Groq returned no message.");
  return { content: message.content ?? null, tool_calls: message.tool_calls };
}

/**
 * Same as callGroqChat, but streams: `onToken` gets each piece of answer text as it arrives, and
 * the full message (content + tool_calls) is returned at the end.
 *
 * Timeout: an IDLE timeout. The clock restarts on every chunk, so a long answer that keeps
 * flowing is fine, but a stalled connection fails after GROQ_TIMEOUT_MS. `signal` lets the caller
 * cancel (for example when the browser disconnects) so we stop paying for tokens nobody reads.
 */
export async function callGroqChatStream(
  messages: ChatMessage[],
  tools: ToolSpec[],
  onToken: (text: string) => void,
  signal?: AbortSignal,
): Promise<ModelReply> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("GROQ_API_KEY is missing. Add it to .env.local.");

  const idle = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const restartIdleTimer = () => {
    clearTimeout(timer);
    timer = setTimeout(() => idle.abort(new Error("Groq stream idle timeout")), GROQ_TIMEOUT_MS);
  };

  restartIdleTimer(); // covers the wait for the first byte too
  try {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      signal: signal ? AbortSignal.any([idle.signal, signal]) : idle.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: chatBody(messages, tools, { stream: true }),
    });
    if (!res.ok) throw new GroqError(res.status, (await res.text()).slice(0, 300));
    if (!res.body) throw new Error("Groq returned no stream.");

    return await readChatStream(res.body, onToken, restartIdleTimer);
  } finally {
    clearTimeout(timer);
  }
}
