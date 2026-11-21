import { describe, expect, it, vi } from "vitest";
import {
  buildRequestMessages, chatReducer, createLineSplitter, initialChatState, readChatEvents, toolStatusLabel,
  MAX_MESSAGE_CHARS, MAX_REQUEST_MESSAGES, type ChatUiState,
} from "@/lib/chat-client";
import { chatRequestSchema } from "@/lib/validation";

const enc = new TextEncoder();
const streamOf = (pieces: (string | Uint8Array)[]) =>
  new ReadableStream<Uint8Array>({ start(c) { for (const p of pieces) c.enqueue(typeof p === "string" ? enc.encode(p) : p); c.close(); } });
const line = (o: unknown) => JSON.stringify(o) + "\n";
const reduce = (state: ChatUiState, ...actions: Parameters<typeof chatReducer>[1][]) => actions.reduce(chatReducer, state);

describe("chatReducer", () => {
  const sent = reduce(initialChatState, { type: "send", question: "hi" });

  it("send: adds the question and an empty assistant bubble, and starts streaming", () => {
    expect(sent).toEqual({ messages: [{ role: "user", content: "hi" }, { role: "assistant", content: "" }], status: null, error: null, streaming: true });
  });

  it("token: appends to the last assistant message", () => {
    const s = reduce(sent, { type: "token", text: "Hel" }, { type: "token", text: "lo" });
    expect(s.messages.at(-1)).toEqual({ role: "assistant", content: "Hello" });
    expect(s.messages[0]).toEqual({ role: "user", content: "hi" }); // earlier messages untouched
  });

  it("tool_start sets a friendly status per tool; tool_result clears it", () => {
    const s1 = reduce(sent, { type: "tool_start", tool: "search_applications" });
    expect(s1.status).toBe("Searching your applications…");
    expect(reduce(s1, { type: "tool_result", tool: "search_applications", count: 2 }).status).toBeNull();
    expect(reduce(sent, { type: "tool_start", tool: "upcoming_interviews" }).status).toBe("Checking interviews…");
    expect(toolStatusLabel("something_new")).toBe("Working…");
  });

  it("the first token clears the status too", () => {
    const s = reduce(sent, { type: "tool_start", tool: "search_applications" }, { type: "token", text: "x" });
    expect(s.status).toBeNull();
  });

  it("done stops streaming and keeps the answer", () => {
    const s = reduce(sent, { type: "token", text: "ok" }, { type: "done" });
    expect(s).toMatchObject({ streaming: false, status: null, error: null });
    expect(s.messages.at(-1)?.content).toBe("ok");
  });

  it("error: shows the message, stops streaming, and removes an EMPTY assistant bubble", () => {
    const s = reduce(sent, { type: "tool_start", tool: "search_applications" }, { type: "error", message: "AI is busy, try again in a minute." });
    expect(s).toMatchObject({ streaming: false, status: null, error: "AI is busy, try again in a minute." });
    expect(s.messages).toEqual([{ role: "user", content: "hi" }]);
  });

  it("error after some text keeps the partial answer", () => {
    const s = reduce(sent, { type: "token", text: "Par" }, { type: "error", message: "Something went wrong. Try again." });
    expect(s.messages.at(-1)?.content).toBe("Par");
  });

  it("aborted (Stop): stops streaming without an error, keeps partial text, drops an empty bubble", () => {
    const partial = reduce(sent, { type: "token", text: "Half" }, { type: "aborted" });
    expect(partial).toMatchObject({ streaming: false, error: null });
    expect(partial.messages.at(-1)?.content).toBe("Half");
    expect(reduce(sent, { type: "aborted" }).messages).toEqual([{ role: "user", content: "hi" }]);
  });

  it("failed (network/HTTP): same as error", () => {
    expect(reduce(sent, { type: "failed", message: "Network error." })).toMatchObject({ streaming: false, error: "Network error." });
  });

  it("a new send clears the previous error", () => {
    const errored = reduce(sent, { type: "error", message: "x" });
    expect(reduce(errored, { type: "send", question: "again" }).error).toBeNull();
  });

  it("ignores unknown event types from a newer server", () => {
    expect(chatReducer(sent, { type: "mystery" } as never)).toBe(sent);
  });
});

describe("buildRequestMessages: what is POSTed must always pass the server's validation", () => {
  it("cuts long assistant answers to 2000 characters (otherwise the NEXT question would 400)", () => {
    const out = buildRequestMessages([
      { role: "user", content: "q" },
      { role: "assistant", content: "a".repeat(5000) },
      { role: "user", content: "follow-up" },
    ]);
    expect(out[1].content).toHaveLength(MAX_MESSAGE_CHARS);
    expect(chatRequestSchema.safeParse({ messages: out }).success).toBe(true);
  });

  it("drops empty / whitespace-only messages (a failed turn leaves an empty bubble)", () => {
    const out = buildRequestMessages([
      { role: "user", content: "first" },
      { role: "assistant", content: "" },
      { role: "user", content: "   " },
      { role: "user", content: "second" },
    ]);
    expect(out.map((m) => m.content)).toEqual(["first", "second"]);
  });

  it("keeps only the last 20 messages, still ending with the user's question", () => {
    const many = Array.from({ length: 45 }, (_, i) => ({ role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant", content: `m${i}` }));
    many.push({ role: "user", content: "latest" });
    const out = buildRequestMessages(many);
    expect(out).toHaveLength(MAX_REQUEST_MESSAGES);
    expect(out.at(-1)).toEqual({ role: "user", content: "latest" });
    expect(chatRequestSchema.safeParse({ messages: out }).success).toBe(true);
  });

  it("trims whitespace and sends only role and content", () => {
    expect(buildRequestMessages([{ role: "user", content: "  hi  " }])).toEqual([{ role: "user", content: "hi" }]);
  });
});

describe("createLineSplitter", () => {
  it("returns only complete lines and keeps the partial one", () => {
    const s = createLineSplitter();
    expect(s.push('{"a":1}\n{"b"')).toEqual(['{"a":1}']);
    expect(s.push(':2}\n{"c":3}\n')).toEqual(['{"b":2}', '{"c":3}']);
    expect(s.flush()).toEqual([]);
  });

  it("flush returns a final line that has no trailing newline", () => {
    const s = createLineSplitter();
    s.push('{"done":true}');
    expect(s.flush()).toEqual(['{"done":true}']);
  });

  it("ignores blank lines and tolerates CRLF", () => {
    expect(createLineSplitter().push('{"a":1}\r\n\r\n\n')).toEqual(['{"a":1}']);
  });
});

describe("readChatEvents", () => {
  const events = [{ type: "tool_start", tool: "search_applications" }, { type: "tool_result", tool: "search_applications", count: 1 }, { type: "token", text: "₹12–18" }, { type: "done" }];
  const body = events.map(line).join("");

  it("delivers every event in order and reports finished: true", async () => {
    const got: unknown[] = [];
    const r = await readChatEvents(streamOf([body]), (e) => got.push(e));
    expect(got).toEqual(events);
    expect(r.finished).toBe(true);
  });

  it("is chunk-boundary safe: same events whether delivered whole or 1, 2, 3, 7 bytes at a time", async () => {
    const bytes = enc.encode(body);
    for (const size of [1, 2, 3, 7, 1000]) {
      const pieces: Uint8Array[] = [];
      for (let i = 0; i < bytes.length; i += size) pieces.push(bytes.slice(i, i + size));
      const got: unknown[] = [];
      await readChatEvents(streamOf(pieces), (e) => got.push(e));
      expect(got).toEqual(events);
    }
  });

  it("handles a last event with no trailing newline", async () => {
    const got: unknown[] = [];
    const r = await readChatEvents(streamOf(['{"type":"token","text":"a"}\n{"type":"done"}']), (e) => got.push(e));
    expect(got).toHaveLength(2);
    expect(r.finished).toBe(true);
  });

  it("an error event counts as finished", async () => {
    const r = await readChatEvents(streamOf([line({ type: "error", message: "x" })]), () => {});
    expect(r.finished).toBe(true);
  });

  it("a stream that ends without done/error reports finished: false (connection dropped)", async () => {
    const got: unknown[] = [];
    const r = await readChatEvents(streamOf([line({ type: "token", text: "part" })]), (e) => got.push(e));
    expect(got).toHaveLength(1);
    expect(r.finished).toBe(false);
  });

  it("skips a malformed line instead of failing the whole stream", async () => {
    const got: { type: string }[] = [];
    await readChatEvents(streamOf(["not json\n", line({ type: "done" })]), (e) => got.push(e));
    expect(got.map((e) => e.type)).toEqual(["done"]);
  });

  it("rejects when the stream errors (e.g. fetch aborted), so the caller can tell Stop from done", async () => {
    const aborting = new ReadableStream<Uint8Array>({
      start(c) { c.enqueue(enc.encode(line({ type: "token", text: "a" }))); },
      pull() { throw new DOMException("aborted", "AbortError"); },
    });
    const onEvent = vi.fn();
    await expect(readChatEvents(aborting, onEvent)).rejects.toThrow();
    expect(onEvent).toHaveBeenCalledWith({ type: "token", text: "a" });
  });
});
