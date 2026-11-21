import type { ModelReply, ToolCall } from "@/lib/chat";

// Pure stream parsing (no fetch, no Groq import), so it is unit-testable with fake byte streams.

/**
 * SSE bytes -> the payload of every `data:` line.
 *
 * Network chunks do not respect line boundaries (a line, a JSON object, even one multi-byte
 * character can be cut in half), so: decode with { stream: true } and keep the incomplete
 * last line in a buffer until its "\n" arrives.
 */
export async function* readSseData(
  body: ReadableStream<Uint8Array>,
  onActivity?: () => void,
): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const lineToData = (rawLine: string): string | null => {
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine; // tolerate CRLF
    if (!line.startsWith("data:")) return null; // blank separators, ":" keep-alive comments, other fields
    return line.slice(5).replace(/^ /, "");
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      onActivity?.();
      buffer += decoder.decode(value, { stream: true });

      let nl: number;
      while ((nl = buffer.indexOf("\n")) !== -1) {
        const data = lineToData(buffer.slice(0, nl));
        buffer = buffer.slice(nl + 1);
        if (data !== null) yield data;
      }
    }
    buffer += decoder.decode(); // flush the decoder
    const last = lineToData(buffer); // a final line may arrive without a trailing newline
    if (last !== null) yield last;
  } finally {
    reader.releaseLock();
  }
}

type Delta = {
  content?: string | null;
  tool_calls?: { index?: number; id?: string; function?: { name?: string; arguments?: string } }[];
};
type Chunk = { choices?: { delta?: Delta; finish_reason?: string | null }[]; error?: unknown };

/**
 * Chat completion stream -> ModelReply. `onToken` is called for every piece of answer text.
 *
 * Tool calls arrive in fragments: the first chunk of each carries its index, id and name; later
 * chunks carry only pieces of the `arguments` string. They are accumulated PER INDEX and
 * concatenated as strings. They are not JSON.parse'd here: the arguments are only complete once
 * the stream ends, and the tool layer parses and validates them.
 */
export async function readChatStream(
  body: ReadableStream<Uint8Array>,
  onToken?: (text: string) => void,
  onActivity?: () => void,
): Promise<ModelReply> {
  let content = "";
  const calls = new Map<number, { id: string; name: string; args: string }>();
  let finished = false; // saw [DONE] or a finish_reason

  for await (const data of readSseData(body, onActivity)) {
    if (data === "[DONE]") { finished = true; break; }

    let chunk: Chunk;
    try {
      chunk = JSON.parse(data) as Chunk;
    } catch {
      throw new Error("Groq stream: malformed chunk"); // never echo the payload: it may contain user text
    }
    if (chunk.error) throw new Error("Groq stream: provider reported an error");

    const choice = chunk.choices?.[0];
    if (!choice) continue;
    if (choice.finish_reason) finished = true;

    const delta = choice.delta;
    if (!delta) continue; // (reasoning fields, role-only chunks etc. are ignored)

    if (delta.content) {
      content += delta.content;
      onToken?.(delta.content);
    }

    for (const tc of delta.tool_calls ?? []) {
      const index = tc.index ?? 0;
      const slot = calls.get(index) ?? { id: "", name: "", args: "" };
      if (tc.id && !slot.id) slot.id = tc.id; // id and name come in the first chunk of each call
      if (tc.function?.name && !slot.name) slot.name = tc.function.name;
      if (tc.function?.arguments) slot.args += tc.function.arguments;
      calls.set(index, slot);
    }
  }

  if (!finished) throw new Error("Groq stream ended unexpectedly"); // cut off mid-answer: don't act on half a reply

  const tool_calls: ToolCall[] = [...calls.entries()]
    .sort(([a], [b]) => a - b)
    .map(([index, c]) => {
      if (!c.name) throw new Error("Groq stream: tool call without a name");
      return {
        id: c.id || `call_${index}`,
        type: "function" as const,
        function: { name: c.name, arguments: c.args },
      };
    });

  return { content: content || null, ...(tool_calls.length > 0 ? { tool_calls } : {}) };
}
