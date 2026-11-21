import type { ChatStreamEvent } from "@/lib/chat-stream"; // type-only: no server code ends up in the browser bundle

// Pure client-side chat logic (no React, no fetch): reducer, stream reader, request builder.
// The ChatPanel component is thin glue around this, so the tricky parts are unit-tested.

/** `failed` marks BOTH halves of a turn that didn't finish (error, dropped connection, Stop): they're shown, but never sent as history. */
export type UiMessage = { role: "user" | "assistant"; content: string; failed?: boolean };

export type ChatUiState = {
  messages: UiMessage[];
  status: string | null; // "Searching your applications…" while a tool runs
  error: string | null;
  streaming: boolean;
};

export const initialChatState: ChatUiState = { messages: [], status: null, error: null, streaming: false };

const TOOL_STATUS: Record<string, string> = {
  search_applications: "Searching your applications…",
  upcoming_interviews: "Checking interviews…",
};
export const toolStatusLabel = (tool: string): string => TOOL_STATUS[tool] ?? "Working…";

export type ChatAction =
  | { type: "send"; question: string }
  | { type: "aborted" } // the user pressed Stop
  | { type: "settled" } // the request is over, however it ended: a safety net that always resets the UI
  | { type: "failed"; message: string } // network / HTTP failure, no stream event
  | ChatStreamEvent;

// A turn that produced no text leaves an empty assistant bubble: remove it on error/abort.
const dropEmptyTail = (messages: UiMessage[]): UiMessage[] => {
  const last = messages[messages.length - 1];
  return last && last.role === "assistant" && last.content === "" ? messages.slice(0, -1) : messages;
};

// Marks the turn that just failed (its question and whatever partial answer exists) so it is
// excluded from history. Without this, the dangling question plus the NEXT question would be
// two consecutive user messages in the request.
const failLastTurn = (messages: UiMessage[]): UiMessage[] => {
  const out = messages.slice();
  let i = out.length - 1;
  if (out[i]?.role === "assistant") { out[i] = { ...out[i], failed: true }; i--; }
  if (out[i]?.role === "user") out[i] = { ...out[i], failed: true };
  return dropEmptyTail(out);
};

export function chatReducer(state: ChatUiState, action: ChatAction): ChatUiState {
  switch (action.type) {
    case "send":
      return {
        messages: [...state.messages, { role: "user", content: action.question }, { role: "assistant", content: "" }],
        status: null,
        error: null,
        streaming: true,
      };
    case "token": {
      const messages = state.messages.slice();
      const last = messages[messages.length - 1];
      if (!last || last.role !== "assistant") return state;
      messages[messages.length - 1] = { ...last, content: last.content + action.text };
      return { ...state, messages, status: null }; // the first token clears the status
    }
    case "tool_start":
      return { ...state, status: toolStatusLabel(action.tool) };
    case "tool_result":
      return { ...state, status: null };
    case "done":
      return { ...state, status: null, streaming: false };
    case "error":
    case "failed":
      return { messages: failLastTurn(state.messages), status: null, error: action.message, streaming: false };
    case "aborted":
      return { ...state, messages: failLastTurn(state.messages), status: null, streaming: false };
    case "settled":
      return { ...state, status: null, streaming: false };
    default:
      return state; // unknown event types from a newer server are ignored
  }
}

// The server rejects a request with more than 20 messages, or any message over 2000 characters
// (see chatRequestSchema). MAX_MESSAGE_CHARS is that hard limit. MAX_REQUEST_MESSAGES is
// deliberately LOWER than the server's 20: every message is re-sent (and billed in tokens) on every
// question, and 20 x 2000 characters is ~10k tokens, more than Groq's free tier allows per minute.
export const MAX_REQUEST_MESSAGES = 10;
export const MAX_MESSAGE_CHARS = 2000;

/**
 * What to POST. An assistant answer can be longer than the server's per-message limit, and a
 * failed turn can leave an empty bubble: send those back as-is and the NEXT question gets a 400.
 * And a failed turn leaves its question without an answer: sent as-is, it would sit next to the next
 * question as two consecutive user messages. So: drop failed turns and empty messages, keep the last
 * 10, cut each to 2000 characters.
 */
export function buildRequestMessages(messages: UiMessage[]): UiMessage[] {
  return messages
    .filter((m) => !m.failed) // failed turns (both halves) are never sent
    .map((m) => ({ role: m.role, content: m.content.trim() }))
    .filter((m) => m.content !== "")
    .slice(-MAX_REQUEST_MESSAGES)
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_MESSAGE_CHARS) }));
}

export const STICK_THRESHOLD_PX = 40;

/**
 * Is the user reading the newest text? Auto-scroll should only follow new tokens when this is true.
 * If they scrolled up to re-read something, leave them alone.
 */
export function isNearBottom(
  el: { scrollHeight: number; scrollTop: number; clientHeight: number },
  threshold = STICK_THRESHOLD_PX,
): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
}

/** Network chunks end anywhere. Keeps the unfinished last line until its newline arrives. */
export function createLineSplitter() {
  let buffer = "";
  return {
    /** Feed decoded text; get back every COMPLETE non-empty line. */
    push(text: string): string[] {
      buffer += text;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      return lines.map((l) => l.trim()).filter(Boolean);
    },
    /** At end of stream: whatever is left (a last line without a trailing newline). */
    flush(): string[] {
      const rest = buffer.trim();
      buffer = "";
      return rest ? [rest] : [];
    },
  };
}

/**
 * Reads the NDJSON body and calls onEvent for each event, in order.
 * Resolves { finished: true } if a terminal event (done / error) arrived. false means the connection
 * ended without one (dropped), which the caller should treat as a failure.
 * Rejects (with an AbortError) if the fetch is aborted.
 */
export async function readChatEvents(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: ChatStreamEvent) => void,
): Promise<{ finished: boolean }> {
  const reader = body.getReader();
  const decoder = new TextDecoder(); // { stream: true } below keeps multi-byte characters intact across chunks
  const splitter = createLineSplitter();
  let finished = false;

  const handle = (line: string) => {
    let event: ChatStreamEvent;
    try {
      event = JSON.parse(line) as ChatStreamEvent;
    } catch {
      return; // a malformed line is skipped, not fatal
    }
    if (event.type === "done" || event.type === "error") finished = true;
    onEvent(event);
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const line of splitter.push(decoder.decode(value, { stream: true }))) handle(line);
    }
    for (const line of splitter.push(decoder.decode())) handle(line);
    for (const line of splitter.flush()) handle(line);
  } finally {
    reader.releaseLock();
  }
  return { finished };
}
