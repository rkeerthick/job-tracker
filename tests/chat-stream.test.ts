import { beforeEach, describe, expect, it, vi } from "vitest";
import { BUSY_ERROR, clientErrorMessage, createChatStream, GENERIC_ERROR, NDJSON_HEADERS, type ChatStreamEvent } from "@/lib/chat-stream";
import type { ChatMessage, ChatModel, ToolCall } from "@/lib/chat";
import { GroqError } from "@/lib/groq";
import { toolDefinitions, type ChatTool, type ToolName } from "@/lib/tools/definitions";

const call = (id: string, name: string, args: unknown): ToolCall => ({ id, type: "function", function: { name, arguments: JSON.stringify(args) } });
const fakeTools = (run: ChatTool["run"] = async () => ({ results: [{ id: 1 } as never] })) =>
  Object.fromEntries(toolDefinitions.map((d) => [d.name, { ...d, run }])) as Record<ToolName, ChatTool>;

let logged: string[];
beforeEach(() => {
  logged = [];
  for (const m of ["log", "warn", "error"] as const) vi.spyOn(console, m).mockImplementation((l) => { logged.push(String(l)); });
});

const readAll = async (stream: ReadableStream<Uint8Array>) => {
  const reader = stream.getReader();
  const dec = new TextDecoder();
  let text = "";
  while (true) { const { done, value } = await reader.read(); if (done) break; text += dec.decode(value, { stream: true }); }
  return text;
};
const parse = (text: string) => text.split("\n").filter(Boolean).map((l) => JSON.parse(l) as ChatStreamEvent);
const run = (over: Partial<Parameters<typeof createChatStream>[0]> & { callModel: ChatModel }) =>
  createChatStream({ userId: 7, messages: [{ role: "user", content: "SECRET QUESTION" }], tools: fakeTools(), signal: new AbortController().signal, ...over });

describe("createChatStream: NDJSON", () => {
  it("writes one JSON object per line, each ending in a newline, and ends with done", async () => {
    const model: ChatModel = async (_m, _t, onToken) => { onToken?.("Hel"); onToken?.("lo"); return { content: "Hello" }; };
    const text = await readAll(run({ callModel: model }));
    expect(text.endsWith("\n")).toBe(true);
    expect(parse(text)).toEqual([{ type: "token", text: "Hel" }, { type: "token", text: "lo" }, { type: "done" }]);
  });

  it("streams tool_start / tool_result between the tokens, in order", async () => {
    let n = 0;
    const model: ChatModel = async (_m, _t, onToken) => {
      if (n++ === 0) return { content: null, tool_calls: [call("c", "search_applications", {})] };
      onToken?.("Found 1."); return { content: "Found 1." };
    };
    expect(parse(await readAll(run({ callModel: model }))).map((e) => e.type)).toEqual(["tool_start", "tool_result", "token", "done"]);
  });

  it("sends the history before the new question, and the right headers constants", async () => {
    let seen: ChatMessage[] = [];
    const model: ChatModel = async (m) => { seen = structuredClone(m); return { content: "ok" }; };
    await readAll(run({
      callModel: model,
      messages: [{ role: "user", content: "first" }, { role: "assistant", content: "reply" }, { role: "user", content: "second" }],
    }));
    expect(seen.slice(1).map((m) => [m.role, (m as { content: string }).content])).toEqual([["user", "first"], ["assistant", "reply"], ["user", "second"]]);
    expect(NDJSON_HEADERS["Content-Type"]).toBe("application/x-ndjson");
    expect(NDJSON_HEADERS["Cache-Control"]).toContain("no-store");
  });
});

describe("createChatStream: errors become one terminal error event", () => {
  it("clientErrorMessage: only a Groq 429 is 'busy', everything else is generic", () => {
    expect(clientErrorMessage(new GroqError(429, "x"))).toBe(BUSY_ERROR);
    expect(clientErrorMessage(new GroqError(500, "x"))).toBe(GENERIC_ERROR);
    expect(clientErrorMessage(new Error("db password=hunter2"))).toBe(GENERIC_ERROR);
  });

  it("Groq 429 -> 'AI is busy', with no internals in the stream", async () => {
    const model: ChatModel = async () => { throw new GroqError(429, "org_SECRET tokens per minute"); };
    const text = await readAll(run({ callModel: model }));
    expect(parse(text)).toEqual([{ type: "error", message: "AI is busy, try again in a minute." }]);
    expect(text).not.toMatch(/org_SECRET|429|Groq/);
  });

  it("any other error -> the generic message; the raw error stays server-side", async () => {
    const model: ChatModel = async () => { throw new Error("connection to 10.0.0.5 refused password=hunter2"); };
    const text = await readAll(run({ callModel: model }));
    expect(parse(text)).toEqual([{ type: "error", message: "Something went wrong. Try again." }]);
    expect(text).not.toMatch(/10\.0\.0\.5|hunter2/);
    expect(logged.some((l) => l.includes('"level":"error"') && l.includes("chat failed"))).toBe(true);
  });

  it("an error after some tokens still ends with an error event (and the stream closes)", async () => {
    const model: ChatModel = async (_m, _t, onToken) => { onToken?.("Par"); throw new Error("stream cut"); };
    expect(parse(await readAll(run({ callModel: model }))).map((e) => e.type)).toEqual(["token", "error"]);
  });

  it("never logs the question or the answer", async () => {
    const model: ChatModel = async (_m, _t, onToken) => { onToken?.("SECRET ANSWER"); return { content: "SECRET ANSWER" }; };
    await readAll(run({ callModel: model }));
    const failing: ChatModel = async () => { throw new Error("boom"); };
    await readAll(run({ callModel: failing }));
    expect(logged.length).toBeGreaterThan(0);
    for (const l of logged) { expect(l).not.toContain("SECRET QUESTION"); expect(l).not.toContain("SECRET ANSWER"); }
  });
});

describe("createChatStream: client abort / cancel", () => {
  const hangingModel = (seen: { signal?: AbortSignal; calls: number }): ChatModel => (_m, _t, _tok, signal) => {
    seen.signal = signal; seen.calls++;
    return new Promise((_res, rej) => signal!.addEventListener("abort", () => rej(signal!.reason)));
  };

  it("when the request signal aborts: the model call is cancelled, the loop stops, and NO error event is sent", async () => {
    const seen = { calls: 0 } as { signal?: AbortSignal; calls: number };
    const ac = new AbortController();
    const reading = readAll(run({ callModel: hangingModel(seen), signal: ac.signal }));
    await vi.waitFor(() => expect(seen.calls).toBe(1));
    ac.abort(new Error("client disconnected"));

    expect(await reading).toBe(""); // nothing written, in particular no error event
    expect(seen.signal!.aborted).toBe(true); // the upstream (Groq) request was told to stop
    expect(seen.calls).toBe(1);
    expect(logged.some((l) => l.includes("chat aborted by client"))).toBe(true);
    expect(logged.some((l) => l.includes("chat failed"))).toBe(false);
  });

  it("when the consumer cancels the stream, the model call is cancelled too", async () => {
    const seen = { calls: 0 } as { signal?: AbortSignal; calls: number };
    const stream = run({ callModel: hangingModel(seen) });
    const reader = stream.getReader();
    await vi.waitFor(() => expect(seen.calls).toBe(1));
    await reader.cancel();
    await vi.waitFor(() => expect(seen.signal!.aborted).toBe(true));
  });

  it("after the client is gone, no further tools run", async () => {
    const ac = new AbortController();
    const toolRun = vi.fn().mockImplementation(async () => { ac.abort(new Error("gone")); return { results: [] }; });
    const model: ChatModel = async () => ({ content: null, tool_calls: [call("1", "search_applications", {}), call("2", "upcoming_interviews", {})] });
    await readAll(run({ callModel: model, tools: fakeTools(toolRun), signal: ac.signal }));
    expect(toolRun).toHaveBeenCalledTimes(1);
  });
});
