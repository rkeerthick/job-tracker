"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { buildRequestMessages, chatReducer, initialChatState, readChatEvents, type UiMessage } from "@/lib/chat-client";

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
                <span className="text-muted">{status ?? "…"}</span>
              ) : (
                <p className="whitespace-pre-wrap wrap-break-word">{m.content}</p>
              )}
            </div>
            {/* While a tool runs (after some text), show the status under the bubble instead of inside it. */}
            {streaming && isLast && m.role === "assistant" && m.content !== "" && status && (
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

  // Auto-scroll to the newest text as it streams in.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [state.messages, state.status]);

  // Leaving the page cancels the request (and, server-side, the upstream model call).
  useEffect(() => () => abortRef.current?.abort(), []);

  async function send(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const question = input.trim();
    if (!question || state.streaming || abortRef.current) return; // one request at a time

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
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        ref={scrollRef}
        role="log"
        aria-live="polite"
        aria-label="Conversation"
        className="h-72 overflow-y-auto rounded-md border border-border bg-bg p-3"
      >
        {state.messages.length === 0 ? (
          <p className="text-sm text-muted">Ask about your applications, e.g. “Which interviews do I have next week?”</p>
        ) : (
          <ChatMessageList messages={state.messages} status={state.status} streaming={state.streaming} />
        )}
      </div>

      {state.error && <Alert>{state.error}</Alert>}

      <form onSubmit={send} className="flex items-start gap-2">
        <div className="flex-1">
          <Input
            aria-label="Your question"
            placeholder="Ask a question…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            maxLength={2000}
            disabled={state.streaming}
            autoComplete="off"
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
