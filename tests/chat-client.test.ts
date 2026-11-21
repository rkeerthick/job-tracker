import { describe, expect, it, vi } from "vitest";
import {
  buildRequestMessages, chatReducer, createLineSplitter, initialChatState, isNearBottom, readChatEvents, toolStatusLabel, STICK_THRESHOLD_PX,
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
    expect(s.messages).toEqual([{ role: "user", content: "hi", failed: true }]); // the question stays visible, flagged as failed
  });

  it("error after some text keeps the partial answer, and flags the whole turn as failed", () => {
    const s = reduce(sent, { type: "token", text: "Par" }, { type: "error", message: "Something went wrong. Try again." });
    expect(s.messages).toEqual([{ role: "user", content: "hi", failed: true }, { role: "assistant", content: "Par", failed: true }]);
  });

  it("aborted (Stop): stops streaming without an error, keeps partial text, drops an empty bubble", () => {
    const partial = reduce(sent, { type: "token", text: "Half" }, { type: "aborted" });
    expect(partial).toMatchObject({ streaming: false, error: null });
    expect(partial.messages.at(-1)).toEqual({ role: "assistant", content: "Half", failed: true }); // incomplete answers aren't history
    expect(reduce(sent, { type: "aborted" }).messages).toEqual([{ role: "user", content: "hi", failed: true }]);
  });

  it("failed (network/HTTP): same as error", () => {
    expect(reduce(sent, { type: "failed", message: "Network error." })).toMatchObject({ streaming: false, error: "Network error." });
  });

  it("settled always resets streaming and the status, and leaves messages and error alone", () => {
    const busy = reduce(sent, { type: "tool_start", tool: "search_applications" });
    expect(reduce(busy, { type: "settled" })).toEqual({ ...busy, status: null, streaming: false });
    const errored = reduce(sent, { type: "error", message: "x" });
    expect(reduce(errored, { type: "settled" })).toEqual(errored);
  });

  it("failed (HTTP/network error): the EMPTY assistant bubble is removed, the question stays, the error is shown", () => {
    const s = reduce(sent, { type: "failed", message: "Network error. Please try again." });
    expect(s.messages).toEqual([{ role: "user", content: "hi", failed: true }]);
    expect(s.messages.some((m) => m.role === "assistant")).toBe(false); // no empty bubble
    expect(s).toMatchObject({ error: "Network error. Please try again.", streaming: false, status: null });
  });

  it("failed after partial text keeps that text (it is only an empty bubble that is removed)", () => {
    const s = reduce(sent, { type: "token", text: "Partial" }, { type: "failed", message: "Connection lost. Try again." });
    expect(s.messages.at(-1)).toMatchObject({ role: "assistant", content: "Partial" });
  });

  it("Stop (aborted) keeps the partial answer EXACTLY as streamed, and shows no error", () => {
    const streamed = reduce(sent, { type: "token", text: "Here are " }, { type: "token", text: "your appl" });
    const stopped = reduce(streamed, { type: "aborted" });
    expect(stopped.messages.at(-1)?.content).toBe("Here are your appl"); // not removed, not altered
    expect(stopped.error).toBeNull();
    expect(stopped.streaming).toBe(false);
  });

  it("a completed turn is never flagged failed", () => {
    const s = reduce(sent, { type: "token", text: "ok" }, { type: "done" });
    expect(s.messages.some((m) => m.failed)).toBe(false);
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

  it("keeps only the last 10 messages, still ending with the user's question", () => {
    const many = Array.from({ length: 45 }, (_, i) => ({ role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant", content: `m${i}` }));
    many.push({ role: "user", content: "latest" });
    const out = buildRequestMessages(many);
    expect(out).toHaveLength(MAX_REQUEST_MESSAGES);
    expect(out.at(-1)).toEqual({ role: "user", content: "latest" });
    expect(chatRequestSchema.safeParse({ messages: out }).success).toBe(true);
  });

  it("excludes a FAILED turn entirely, so a retry never sends two user messages in a row", () => {
    // turn 1 completed, turn 2 failed (question has no answer), turn 3 is the retry
    let st = reduce(initialChatState, { type: "send", question: "q1" }, { type: "token", text: "a1" }, { type: "done" });
    st = reduce(st, { type: "send", question: "q2 (fails)" }, { type: "error", message: "AI is busy" });
    const out = buildRequestMessages([...st.messages, { role: "user", content: "q3" }]);
    expect(out).toEqual([{ role: "user", content: "q1" }, { role: "assistant", content: "a1" }, { role: "user", content: "q3" }]);
    for (let i = 1; i < out.length; i++) expect(out[i].role === "user" && out[i - 1].role === "user").toBe(false);
  });

  it("excludes a stopped turn's partial answer too (an incomplete answer is not history)", () => {
    const st = reduce(initialChatState, { type: "send", question: "q1" }, { type: "token", text: "Half an ans" }, { type: "aborted" });
    expect(buildRequestMessages([...st.messages, { role: "user", content: "q2" }])).toEqual([{ role: "user", content: "q2" }]);
  });

  it("never leaks the failed flag into the request", () => {
    const out = buildRequestMessages([{ role: "user", content: "a" }]);
    expect(Object.keys(out[0]).sort()).toEqual(["content", "role"]);
  });

  it("trims whitespace and sends only role and content", () => {
    expect(buildRequestMessages([{ role: "user", content: "  hi  " }])).toEqual([{ role: "user", content: "hi" }]);
  });
});

describe("a long conversation never produces a request the server would reject", () => {
  const LONG = "x".repeat(3000); // longer than the server's 2000-character limit

  it("the window is smaller than the server's 20-message limit (token budget)", () => {
    expect(MAX_REQUEST_MESSAGES).toBeLessThan(20);
  });

  it("20 turns of 3000-character answers, with errors and Stops mixed in: EVERY request passes the real schema", () => {
    let st = initialChatState;
    for (let turn = 1; turn <= 20; turn++) {
      const question = `question ${turn}`;
      const request = buildRequestMessages([...st.messages, { role: "user", content: question }]);

      // exactly what the server would validate
      expect(chatRequestSchema.safeParse({ messages: request }).success, `turn ${turn} request was rejected`).toBe(true);
      expect(request.length).toBeLessThanOrEqual(MAX_REQUEST_MESSAGES);
      expect(request.at(-1)).toEqual({ role: "user", content: question });
      for (let i = 1; i < request.length; i++) expect(request[i].role === "user" && request[i - 1].role === "user").toBe(false);
      for (const m of request) expect(m.content.length).toBeLessThanOrEqual(MAX_MESSAGE_CHARS);

      st = reduce(st, { type: "send", question });
      if (turn % 5 === 0) st = reduce(st, { type: "error", message: "AI is busy" });             // failed with an empty bubble
      else if (turn % 7 === 0) st = reduce(st, { type: "token", text: "partial" }, { type: "aborted" }); // Stop mid-answer
      else st = reduce(st, { type: "token", text: LONG }, { type: "done" });                      // long, successful answer
    }
  });

  it("a follow-up right after a long answer is accepted, and the long answer is cut to 2000 characters", () => {
    const st = reduce(initialChatState, { type: "send", question: "list all my applications in detail" }, { type: "token", text: LONG }, { type: "done" });
    const request = buildRequestMessages([...st.messages, { role: "user", content: "which one is newest?" }]);
    expect(chatRequestSchema.safeParse({ messages: request }).success).toBe(true);
    expect(request[1].content).toHaveLength(MAX_MESSAGE_CHARS);
  });

  it("the 11th question (22 messages in the UI) is still accepted", () => {
    let st = initialChatState;
    for (let i = 1; i <= 10; i++) st = reduce(st, { type: "send", question: `q${i}` }, { type: "token", text: `a${i}` }, { type: "done" });
    expect(st.messages).toHaveLength(20);
    const request = buildRequestMessages([...st.messages, { role: "user", content: "q11" }]);
    expect(request).toHaveLength(MAX_REQUEST_MESSAGES);
    expect(request.at(-1)?.content).toBe("q11");
    expect(chatRequestSchema.safeParse({ messages: request }).success).toBe(true);
  });
});

describe("isNearBottom (auto-scroll only follows the user at the bottom)", () => {
  const box = (scrollTop: number) => ({ scrollHeight: 1000, clientHeight: 300, scrollTop });

  it("true at the very bottom, and within the threshold", () => {
    expect(isNearBottom(box(700))).toBe(true); // gap 0
    expect(isNearBottom(box(700 - STICK_THRESHOLD_PX + 1))).toBe(true); // gap 39
  });

  it("false once the user has scrolled up by the threshold or more", () => {
    expect(isNearBottom(box(700 - STICK_THRESHOLD_PX))).toBe(false); // gap 40
    expect(isNearBottom(box(0))).toBe(false); // top
  });

  it("true when everything fits (nothing to scroll)", () => {
    expect(isNearBottom({ scrollHeight: 200, clientHeight: 300, scrollTop: 0 })).toBe(true);
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

  it("EXHAUSTIVE: split the stream at EVERY byte position (two chunks): always the same events, including inside Tamil and emoji", async () => {
    const tricky = [
      { type: "tool_start", tool: "search_applications" },
      { type: "token", text: "வணக்கம் 😀 ₹12–18 LPA\n" }, // 3-byte and 4-byte characters, an escaped newline
      { type: "token", text: "second" },
      { type: "done" },
    ];
    const bytes = enc.encode(tricky.map(line).join(""));
    for (let cut = 1; cut < bytes.length; cut++) {
      const got: unknown[] = [];
      const r = await readChatEvents(streamOf([bytes.slice(0, cut), bytes.slice(cut)]), (e) => got.push(e));
      expect(got, `cut at byte ${cut}`).toEqual(tricky);
      expect(r.finished).toBe(true);
    }
  });

  it("EXHAUSTIVE: splitting into THREE chunks at every pair of positions also gives the same events", async () => {
    const evs = [{ type: "token", text: "a😀" }, { type: "token", text: "bc" }, { type: "done" }];
    const bytes = enc.encode(evs.map(line).join(""));
    for (let i = 1; i < bytes.length - 1; i++) {
      for (let j = i + 1; j < bytes.length; j++) {
        const got: unknown[] = [];
        await readChatEvents(streamOf([bytes.slice(0, i), bytes.slice(i, j), bytes.slice(j)]), (e) => got.push(e));
        expect(got, `cuts at ${i},${j}`).toEqual(evs);
      }
    }
  });

  it("never emits a half event: an event arrives only once its newline has", async () => {
    const got: unknown[] = [];
    const full = line({ type: "token", text: "hello" });
    const reader = new ReadableStream<Uint8Array>({
      async start(c) {
        c.enqueue(enc.encode(full.slice(0, -3))); // everything but the end of the line
        await new Promise((r) => setTimeout(r, 20));
        expect(got).toHaveLength(0); // nothing delivered yet
        c.enqueue(enc.encode(full.slice(-3)));
        c.close();
      },
    });
    await readChatEvents(reader, (e) => got.push(e));
    expect(got).toEqual([{ type: "token", text: "hello" }]);
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
