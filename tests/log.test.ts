import { afterEach, describe, expect, it, vi } from "vitest";
import { log, serializeError } from "@/lib/log";

afterEach(() => vi.restoreAllMocks());

function captured(level: "error" | "warn" | "log") {
  const spy = vi.spyOn(console, level).mockImplementation(() => {});
  return { spy, last: () => JSON.parse(spy.mock.calls.at(-1)![0] as string) };
}

describe("log", () => {
  it("writes one JSON line with level, message, time and fields", () => {
    const c = captured("log");
    log("info", "hello", { route: "GET /x", userId: 7 });
    expect(c.last()).toMatchObject({ level: "info", message: "hello", route: "GET /x", userId: 7 });
    expect(typeof c.last().time).toBe("string");
  });

  it("uses console.error for errors (Vercel shows them as errors)", () => {
    const c = captured("error");
    log("error", "boom", { route: "POST /x" });
    expect(c.spy).toHaveBeenCalledOnce();
    expect(c.last().level).toBe("error");
  });

  it("redacts password, token, cookie and hash fields, including nested ones", () => {
    const c = captured("log");
    log("info", "x", {
      password: "hunter2",
      sessionToken: "abc",
      tokenHash: "def",
      nested: { cookie: "session=abc", ok: "visible" },
    });
    const line = JSON.stringify(c.last());
    expect(line).not.toMatch(/hunter2|abc|def|session=/);
    expect(c.last().nested.ok).toBe("visible");
  });

  it("does not let fields overwrite level or message", () => {
    const c = captured("log");
    log("info", "real", { level: "fake", message: "fake" });
    expect(c.last()).toMatchObject({ level: "info", message: "real" });
  });
});

describe("serializeError", () => {
  it("keeps name, message and code, and drops drizzle's params tail", () => {
    const err = Object.assign(new Error('Failed query: insert into "notes" ...\nparams: 1,my private note'), {
      code: "23505",
    });
    const out = serializeError(err) as { message: string; code: string };
    expect(out.code).toBe("23505");
    expect(out.message).toContain("Failed query");
    expect(out.message).not.toContain("private note");
  });
});
