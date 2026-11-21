import type { ChatStreamEvent } from "@/lib/chat-stream"; // type-only: no server code ends up in the browser bundle

// Pure client-side chat logic (no React, no fetch): reducer, stream reader, request builder.
// The ChatPanel component is thin glue around this, so the tricky parts are unit-tested.

export type UiMessage = { role: "user" | "assistant"; content: string };

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
  | { type: "failed"; message: string } // network / HTTP failure, no stream event
  | ChatStreamEvent;

// A turn that produced no text leaves an empty assistant bubble: remove it on error/abort.
const dropEmptyTail = (messages: UiMessage[]): UiMessage[] => {
  const last = messages[messages.length - 1];
  return last && last.role === "assistant" && last.content === "" ? messages.slice(0, -1) : messages;
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
      return { messages: dropEmptyTail(state.messages), status: null, error: action.message, streaming: false };
    case "failed":
      return { messages: dropEmptyTail(state.messages), status: null, error: action.message, streaming: false };
    case "aborted":
      return { ...state, messages: dropEmptyTail(state.messages), status: null, streaming: false };
    default:
      return state; // unknown event types from a newer server are ignored
  }
}

// The server rejects anything beyond these (see chatRequestSchema).
export const MAX_REQUEST_MESSAGES = 20;
export const MAX_MESSAGE_CHARS = 2000;

/**
 * What to POST. An assistant answer can be longer than the server's per-message limit, and a
 * failed turn can leave an empty bubble: send those back as-is and the NEXT question gets a 400.
 * So: drop empty messages, keep the last 20, cut each to 2000 characters.
 */
export function buildRequestMessages(messages: UiMessage[]): UiMessage[] {
  return messages
    .map((m) => ({ role: m.role, content: m.content.trim() }))
    .filter((m) => m.content !== "")
    .slice(-MAX_REQUEST_MESSAGES)
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_MESSAGE_CHARS) }));
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
