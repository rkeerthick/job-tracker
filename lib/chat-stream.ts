import { GroqError } from "@/lib/groq";
import { runChat, type ChatEvent, type ChatModel, type HistoryMessage } from "@/lib/chat";
import { log } from "@/lib/log";
import type { ChatTool, ToolName } from "@/lib/tools/definitions";

// Builds the NDJSON response body for POST /api/chat. Separate from the route so it can be tested
// (and run against the real model) without a login session.

/** What the client receives: runChat's events, plus a terminal error event. */
export type ChatStreamEvent = ChatEvent | { type: "error"; message: string };

export const NDJSON_HEADERS = {
  "Content-Type": "application/x-ndjson",
  // no-transform: stops proxies/compression from buffering the tokens until the end.
  "Cache-Control": "no-store, no-transform",
} as const;

export const GENERIC_ERROR = "Something went wrong. Try again.";
export const BUSY_ERROR = "AI is busy, try again in a minute.";

/** The raw error never reaches the client: it gets one of two fixed messages. */
export function clientErrorMessage(err: unknown): string {
  return err instanceof GroqError && err.status === 429 ? BUSY_ERROR : GENERIC_ERROR;
}

export function createChatStream(opts: {
  userId: number;
  messages: HistoryMessage[]; // validated; the last one is the user's new question
  tools: Record<ToolName, ChatTool>;
  callModel: ChatModel;
  signal: AbortSignal; // the request's signal: aborts when the client disconnects
  route?: string;
}): ReadableStream<Uint8Array> {
  const { userId, messages, tools, callModel, route = "POST /api/chat" } = opts;
  const encoder = new TextEncoder();

  // Aborts when the client disconnects (opts.signal) OR the consumer cancels the stream (cancel() below).
  const stop = new AbortController();
  const signal = AbortSignal.any([opts.signal, stop.signal]);

  return new ReadableStream<Uint8Array>({
    start(controller) {
      // One JSON object per line. If the consumer is gone, enqueue throws and that stops runChat on purpose.
      const send = (event: ChatStreamEvent) => controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));

      void (async () => {
        try {
          const outcome = await runChat({
            question: messages[messages.length - 1].content,
            history: messages.slice(0, -1),
            tools,
            callModel,
            onEvent: send,
            signal,
          });
          // Counts only: the question and the answer are never logged.
          log("info", "chat ok", { route, userId, messageCount: messages.length, steps: outcome.steps, toolCalls: outcome.trace.length, hitLimit: outcome.hitLimit });
        } catch (err) {
          if (signal.aborted) {
            log("info", "chat aborted by client", { route, userId });
          } else {
            log("error", "chat failed", { route, userId, error: err });
            try { send({ type: "error", message: clientErrorMessage(err) }); } catch { /* consumer already gone */ }
          }
        } finally {
          try { controller.close(); } catch { /* already closed or cancelled */ }
        }
      })();
    },
    cancel() {
      stop.abort(new Error("stream cancelled by consumer"));
    },
  });
}
