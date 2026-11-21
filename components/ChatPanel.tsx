"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Input";
import { buildRequestMessages, chatReducer, initialChatState, isNearBottom, readChatEvents, type UiMessage } from "@/lib/chat-client";

/**
 * The message list. Text is rendered as plain React text children: React escapes it, so nothing the
 * model (or an application's own text) contains can become HTML. There is no dangerouslySetInnerHTML.
 */
export function ChatMessageList({ messages, status, streaming }: { messages: UiMessage[]; status: string | null; streaming: boolean }) {
  return (
    <ul className="flex flex-col gap-3">
      {messages.map((m, i) => {
        const isLast = i === messages.length - 1;
        const waiting = streaming && isLast && m.role === "assistant" && m.content === "";
        return (
          <li key={i} className={m.role === "user" ? "self-end" : "self-start"}>
            <div
              className={
                m.role === "user"
                  ? "max-w-prose rounded-lg bg-accent px-3 py-2 text-sm text-accent-fg"
                  : "max-w-prose rounded-lg border border-border bg-surface px-3 py-2 text-sm"
              }
            >
              <span className="sr-only">{m.role === "user" ? "You: " : "Assistant: "}</span>
              {waiting ? (
                <span className="text-muted" aria-hidden="true">…</span>
              ) : (
                <p className="whitespace-pre-wrap wrap-break-word">{m.content}</p>
              )}
            </div>
            {/* Tool status: dim text under the assistant bubble ("Checking interviews…") */}
            {streaming && isLast && m.role === "assistant" && status && (
              <p className="mt-1 text-xs text-muted">{status}</p>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function ChatPanel({ endpoint = "/api/chat" }: { endpoint?: string }) {
  const router = useRouter();
  const [state, dispatch] = useReducer(chatReducer, initialChatState);
  const [input, setInput] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const wasStreaming = useRef(false);
  const stickToBottom = useRef(true); // follow new text only while the user is already at the bottom

  // Auto-scroll to the newest text as it streams in, but NOT if the user scrolled up to read.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [state.messages, state.status]);

  // When a reply finishes, put the cursor back in the box so the next question can be typed straight away.
  useEffect(() => {
    if (wasStreaming.current && !state.streaming) inputRef.current?.focus();
    wasStreaming.current = state.streaming;
  }, [state.streaming]);

  // Leaving the page cancels the request (and, server-side, the upstream model call).
  useEffect(() => () => abortRef.current?.abort(), []);

  async function send(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const question = input.trim();
    if (!question || state.streaming || abortRef.current) return; // one request at a time

    stickToBottom.current = true; // sending a message always jumps to the bottom, to show it and the reply
    const controller = new AbortController();
    abortRef.current = controller;
    const requestMessages = buildRequestMessages([...state.messages, { role: "user", content: question }]);
    dispatch({ type: "send", question });
    setInput("");

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: requestMessages }),
        signal: controller.signal,
      });

      if (res.status === 401) {
        router.push("/login");
        dispatch({ type: "aborted" });
        return;
      }
      if (!res.ok || !res.body) {
        // 400 and friends: a normal JSON error, not a stream.
        const body = (await res.json().catch(() => null)) as { error?: string; fieldErrors?: Record<string, string[]> } | null;
        const firstField = body?.fieldErrors && Object.values(body.fieldErrors).flat()[0];
        dispatch({ type: "failed", message: firstField ?? body?.error ?? "Something went wrong. Try again." });
        return;
      }

      const { finished } = await readChatEvents(res.body, dispatch);
      if (!finished) dispatch({ type: "failed", message: "Connection lost. Try again." }); // ended without done/error
    } catch {
      if (controller.signal.aborted) dispatch({ type: "aborted" }); // the user pressed Stop (or left)
      else dispatch({ type: "failed", message: "Network error. Please try again." });
    } finally {
      abortRef.current = null;
      dispatch({ type: "settled" }); // however the request ended: streaming off, status cleared
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        ref={scrollRef}
        role="log"
        aria-live="polite"
        aria-busy={state.streaming} // while streaming, screen readers wait instead of announcing every token
        aria-label="Conversation"
        onScroll={(e) => { stickToBottom.current = isNearBottom(e.currentTarget); }}
        className="h-72 overflow-y-auto rounded-md border border-border bg-bg p-3"
      >
        {state.messages.length === 0 ? (
          <p className="text-sm text-muted">Ask about your applications. Try: Which interviews do I have next week?</p>
        ) : (
          <ChatMessageList messages={state.messages} status={state.status} streaming={state.streaming} />
        )}
      </div>

      {state.error && <Alert>{state.error}</Alert>}

      <form ref={formRef} onSubmit={send} className="flex items-end gap-2">
        <div className="flex-1">
          <Textarea
            ref={inputRef}
            aria-label="Your question"
            placeholder="Ask a question…  (Enter to send, Shift+Enter for a new line)"
            rows={2}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              // Enter sends, Shift+Enter is a newline. Ignore Enter while an IME is composing (e.g. Tamil/Japanese input).
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                formRef.current?.requestSubmit();
              }
            }}
            maxLength={2000}
            disabled={state.streaming}
          />
        </div>
        {state.streaming ? (
          <Button type="button" variant="secondary" onClick={() => abortRef.current?.abort()}>
            Stop
          </Button>
        ) : (
          <Button type="submit" disabled={input.trim() === ""}>
            Send
          </Button>
        )}
      </form>
    </div>
  );
}
