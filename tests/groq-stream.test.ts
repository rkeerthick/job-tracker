import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readChatStream, readSseData } from "@/lib/groq-stream";
import { callGroqChatStream, GroqError } from "@/lib/groq";

const enc = new TextEncoder();

/** A byte stream made of the given pieces, exactly as the network might deliver them. */
function streamOf(pieces: (string | Uint8Array)[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const p of pieces) controller.enqueue(typeof p === "string" ? enc.encode(p) : p);
      controller.close();
    },
  });
}

/** Cuts the whole payload into pieces of `size` BYTES, which may split lines, JSON and characters. */
function chunked(text: string, size: number): ReadableStream<Uint8Array> {
  const bytes = enc.encode(text);
  const parts: Uint8Array[] = [];
  for (let i = 0; i < bytes.length; i += size) parts.push(bytes.slice(i, i + size));
  return streamOf(parts);
}

const sse = (obj: unknown) => `data: ${JSON.stringify(obj)}\n\n`;
const delta = (d: object, finish: string | null = null) => sse({ choices: [{ delta: d, finish_reason: finish }] });
const DONE = "data: [DONE]\n\n";

async function collect(gen: AsyncGenerator<string>) {
  const out: string[] = [];
  for await (const x of gen) out.push(x);
  return out;
}

describe("readSseData (line buffering)", () => {
  it("yields each data: payload", async () => {
    expect(await collect(readSseData(streamOf(["data: a\n\ndata: b\n\n"])))).toEqual(["a", "b"]);
  });

  it("joins a line that arrives in pieces", async () => {
    expect(await collect(readSseData(streamOf(["da", "ta: hel", "lo\n", "\ndata: wor", "ld\n\n"])))).toEqual(["hello", "world"]);
  });

  it("handles a final line with no trailing newline", async () => {
    expect(await collect(readSseData(streamOf(["data: x\n\ndata: [DONE]"])))).toEqual(["x", "[DONE]"]);
  });

  it("tolerates CRLF, blank lines and ':' keep-alive comments", async () => {
    expect(await collect(readSseData(streamOf([": ping\r\n\r\ndata: a\r\n\r\n: ping\n\ndata: b\r\n"])))).toEqual(["a", "b"]);
  });

  it("does not split a multi-byte character cut across two chunks", async () => {
    const bytes = enc.encode("data: ₹12\n\n"); // ₹ is 3 bytes
    const cut = 7; // inside the ₹ bytes
    expect(await collect(readSseData(streamOf([bytes.slice(0, cut), bytes.slice(cut)])))).toEqual(["₹12"]);
  });

  it("calls onActivity once per network chunk", async () => {
    const onActivity = vi.fn();
    await collect(readSseData(streamOf(["data: a\n", "\n", "data: b\n\n"]), onActivity));
    expect(onActivity).toHaveBeenCalledTimes(3);
  });
});

describe("readChatStream: text", () => {
  const payload = delta({ role: "assistant", content: "" }) + delta({ content: "You have " }) + delta({ content: "₹12–18 LPA" }) + delta({}, "stop") + DONE;

  it("calls onToken for every non-empty piece, in order, and returns the joined content", async () => {
    const onToken = vi.fn();
    const r = await readChatStream(streamOf([payload]), onToken);
    expect(onToken.mock.calls.map((c) => c[0])).toEqual(["You have ", "₹12–18 LPA"]);
    expect(r).toEqual({ content: "You have ₹12–18 LPA" }); // no tool_calls key at all
  });

  it("gives the same result however the bytes are chunked (1, 2, 3, 5, 8, 13 bytes at a time)", async () => {
    for (const size of [1, 2, 3, 5, 8, 13, 1000]) {
      const tokens: string[] = [];
      const r = await readChatStream(chunked(payload, size), (t) => tokens.push(t));
      expect(r.content).toBe("You have ₹12–18 LPA");
      expect(tokens.join("")).toBe("You have ₹12–18 LPA");
    }
  });

  it("ignores reasoning fields and role-only chunks: they never reach onToken", async () => {
    const onToken = vi.fn();
    const p = delta({ role: "assistant" }) + delta({ reasoning: "I should call a tool because SECRET" }) + delta({ content: "Hi" }) + delta({}, "stop") + DONE;
    const r = await readChatStream(streamOf([p]), onToken);
    expect(onToken.mock.calls.map((c) => c[0])).toEqual(["Hi"]);
    expect(JSON.stringify(r)).not.toContain("SECRET");
  });

  it("accepts a stream that ends with [DONE] but no finish_reason, and one with finish_reason but no [DONE]", async () => {
    expect((await readChatStream(streamOf([delta({ content: "a" }) + DONE]))).content).toBe("a");
    expect((await readChatStream(streamOf([delta({ content: "a" }, "stop")]))).content).toBe("a");
  });
});

describe("readChatStream: tool calls arrive in fragments", () => {
  const first = (index: number, id: string, name: string) => delta({ tool_calls: [{ index, id, type: "function", function: { name, arguments: "" } }] });
  const piece = (index: number, args: string) => delta({ tool_calls: [{ index, function: { arguments: args } }] });

  it("concatenates argument pieces by index, and the result parses once complete", async () => {
    const p = first(0, "call_1", "upcoming_interviews") + piece(0, '{"with') + piece(0, 'inDays"') + piece(0, ":7}") + delta({}, "tool_calls") + DONE;
    const r = await readChatStream(streamOf([p]));
    expect(r.content).toBeNull();
    expect(r.tool_calls).toEqual([{ id: "call_1", type: "function", function: { name: "upcoming_interviews", arguments: '{"withinDays":7}' } }]);
    expect(JSON.parse(r.tool_calls![0].function.arguments)).toEqual({ withinDays: 7 });
  });

  it("keeps two calls apart when their fragments are interleaved", async () => {
    const p =
      first(0, "a", "search_applications") + first(1, "b", "upcoming_interviews") +
      piece(1, '{"withinDays"') + piece(0, '{"query":') + piece(1, ":3}") + piece(0, '"react"}') +
      delta({}, "tool_calls") + DONE;
    const r = await readChatStream(streamOf([p]));
    expect(r.tool_calls?.map((c) => [c.id, c.function.name, c.function.arguments])).toEqual([
      ["a", "search_applications", '{"query":"react"}'],
      ["b", "upcoming_interviews", '{"withinDays":3}'],
    ]);
  });

  it("is chunk-boundary safe for tool calls too (1 byte at a time)", async () => {
    const p = first(0, "c", "search_applications") + piece(0, '{"query":"₹"}') + delta({}, "tool_calls") + DONE;
    const r = await readChatStream(chunked(p, 1));
    expect(r.tool_calls?.[0].function.arguments).toBe('{"query":"₹"}');
  });

  it("returns content AND tool_calls when the model talks before calling a tool", async () => {
    const onToken = vi.fn();
    const p = delta({ content: "Let me check. " }) + first(0, "c", "search_applications") + piece(0, "{}") + delta({}, "tool_calls") + DONE;
    const r = await readChatStream(streamOf([p]), onToken);
    expect(r.content).toBe("Let me check. ");
    expect(onToken).toHaveBeenCalledWith("Let me check. ");
    expect(r.tool_calls).toHaveLength(1);
  });

  it("repeating the name or id in later fragments doesn't duplicate them", async () => {
    const p = delta({ tool_calls: [{ index: 0, id: "c", function: { name: "search_applications", arguments: "{" } }] }) +
      delta({ tool_calls: [{ index: 0, id: "c", function: { name: "search_applications", arguments: "}" } }] }) + delta({}, "tool_calls") + DONE;
    const r = await readChatStream(streamOf([p]));
    expect(r.tool_calls).toEqual([{ id: "c", type: "function", function: { name: "search_applications", arguments: "{}" } }]);
  });

  it("makes up an id if the provider sends none", async () => {
    const p = delta({ tool_calls: [{ index: 0, function: { name: "search_applications", arguments: "{}" } }] }) + delta({}, "tool_calls") + DONE;
    expect((await readChatStream(streamOf([p]))).tool_calls?.[0].id).toBe("call_0");
  });
});

describe("readChatStream: failures", () => {
  it("throws if the stream is cut off before [DONE] / finish_reason: never act on a half reply", async () => {
    const p = delta({ content: "partial" }); // connection dropped here
    await expect(readChatStream(streamOf([p]))).rejects.toThrow("ended unexpectedly");
  });

  it("throws when the provider sends an error chunk, without echoing it", async () => {
    const p = delta({ content: "x" }) + sse({ error: { message: "rate limited for org_SECRET" } });
    const err = await readChatStream(streamOf([p])).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).not.toContain("org_SECRET");
  });

  it("throws on a malformed chunk without echoing its text (it may contain the user's text)", async () => {
    const err = await readChatStream(streamOf(["data: {not json SECRET-POSTING-TEXT\n\n"])).catch((e: Error) => e);
    expect((err as Error).message).toContain("malformed");
    expect((err as Error).message).not.toContain("SECRET");
  });

  it("throws on a tool call that never got a name", async () => {
    const p = delta({ tool_calls: [{ index: 0, id: "c", function: { arguments: "{}" } }] }) + delta({}, "tool_calls") + DONE;
    await expect(readChatStream(streamOf([p]))).rejects.toThrow("without a name");
  });
});

describe("callGroqChatStream (fetch mocked)", () => {
  beforeEach(() => { vi.stubEnv("GROQ_API_KEY", "gsk_test"); });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.useRealTimers(); });

  const okResponse = (body: string) => new Response(streamOf([body]), { status: 200 });
  const messages = [{ role: "user" as const, content: "hi" }];
  const tools = [{ name: "search_applications", description: "d", parameters: { type: "object" } }];

  it("sends stream: true with the tools, streams tokens, and returns the reply", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse(delta({ content: "Hel" }) + delta({ content: "lo" }, "stop") + DONE));
    vi.stubGlobal("fetch", fetchMock);
    const tokens: string[] = [];

    const r = await callGroqChatStream(messages, tools, (t) => tokens.push(t));

    expect(r).toEqual({ content: "Hello" });
    expect(tokens).toEqual(["Hel", "lo"]);
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(sent).toMatchObject({ stream: true, tool_choice: "auto", temperature: 0 });
    expect(sent.tools[0]).toMatchObject({ type: "function", function: { name: "search_applications" } });
  });

  it("throws GroqError for a non-OK status, with the body only in `detail`, never in the message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("echoed user text SECRET", { status: 429 })));
    const err = await callGroqChatStream(messages, tools, () => {}).catch((e) => e);
    expect(err).toBeInstanceOf(GroqError);
    expect(err.status).toBe(429);
    expect(err.message).toBe("Groq API error 429");
    expect(err.detail).toContain("SECRET");
  });

  it("fails fast when the API key is missing", async () => {
    vi.stubEnv("GROQ_API_KEY", "");
    vi.stubGlobal("fetch", vi.fn());
    await expect(callGroqChatStream(messages, tools, () => {})).rejects.toThrow("GROQ_API_KEY is missing");
  });

  it("aborts the request when the caller's signal aborts (client disconnected)", async () => {
    vi.stubGlobal("fetch", vi.fn((_url: string, init: RequestInit) => new Promise((_res, rej) => {
      init.signal!.addEventListener("abort", () => rej(init.signal!.reason));
    })));
    const caller = new AbortController();
    const pending = callGroqChatStream(messages, tools, () => {}, caller.signal);
    caller.abort(new Error("client gone"));
    await expect(pending).rejects.toThrow("client gone");
  });

  it("times out when no bytes arrive for GROQ_TIMEOUT_MS (idle timeout)", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn((_url: string, init: RequestInit) => new Promise((_res, rej) => {
      init.signal!.addEventListener("abort", () => rej(init.signal!.reason));
    })));
    const pending = callGroqChatStream(messages, tools, () => {});
    const assertion = expect(pending).rejects.toThrow("idle timeout");
    await vi.advanceTimersByTimeAsync(12_001);
    await assertion;
  });
});
