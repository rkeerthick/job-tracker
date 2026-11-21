import { describe, expect, it } from "vitest";
import { STATUSES } from "@/lib/statuses";
import { escapeLike } from "@/lib/tools/like";
import { formatIST, interviewWindow } from "@/lib/tools/time";
import { parseToolArgs, searchApplicationsArgs, upcomingInterviewsArgs } from "@/lib/tools/args";
import { NO_MATCH_MESSAGE, toToolResult } from "@/lib/tools/format";
import { buildSearchQuery } from "@/lib/tools/search-applications";
import { buildInterviewsQuery } from "@/lib/tools/upcoming-interviews";
import { createChatTools, runTool, toolDefinitions } from "@/lib/tools";

describe("interviewWindow", () => {
  const now = new Date("2026-11-21T10:00:00Z");

  it("runs from now to now + withinDays", () => {
    const { from, to } = interviewWindow(now, 7);
    expect(from.toISOString()).toBe("2026-11-21T10:00:00.000Z");
    expect(to.toISOString()).toBe("2026-11-28T10:00:00.000Z");
  });

  it("handles the allowed range (1 and 30 days) and doesn't mutate `now`", () => {
    expect(interviewWindow(now, 1).to.toISOString()).toBe("2026-11-22T10:00:00.000Z");
    expect(interviewWindow(now, 30).to.toISOString()).toBe("2026-12-21T10:00:00.000Z");
    expect(now.toISOString()).toBe("2026-11-21T10:00:00.000Z");
  });

  it("rejects a non-finite withinDays", () => {
    expect(() => interviewWindow(now, NaN)).toThrow(RangeError);
  });
});

describe("formatIST", () => {
  it("formats in Asia/Kolkata, as the model should quote it", () => {
    expect(formatIST(new Date("2026-11-24T09:30:00Z"))).toBe("24 Nov 2026, 3:00 pm");
  });

  it("rolls over to the next IST date (UTC evening is already tomorrow in India)", () => {
    expect(formatIST(new Date("2026-11-24T19:00:00Z"))).toBe("25 Nov 2026, 12:30 am");
  });
});

describe("escapeLike", () => {
  it("escapes %, _ and backslash so they match literally", () => {
    expect(escapeLike("50%")).toBe("50\\%");
    expect(escapeLike("a_b")).toBe("a\\_b");
    expect(escapeLike("a\\b")).toBe("a\\\\b");
    expect(escapeLike("plain")).toBe("plain");
  });
});

describe("tool arguments (untrusted model input)", () => {
  it("applies defaults", () => {
    expect(parseToolArgs(searchApplicationsArgs, {})).toEqual({ ok: true, data: { limit: 10 } });
    expect(parseToolArgs(upcomingInterviewsArgs, undefined)).toEqual({ ok: true, data: { withinDays: 7 } });
  });

  it("treats null and empty string as 'not set'", () => {
    const r = parseToolArgs(searchApplicationsArgs, { query: null, status: "", limit: null });
    expect(r).toEqual({ ok: true, data: { limit: 10 } });
  });

  it("accepts numeric strings and a JSON-string argument object", () => {
    expect(parseToolArgs(upcomingInterviewsArgs, { withinDays: "14" })).toEqual({ ok: true, data: { withinDays: 14 } });
    expect(parseToolArgs(upcomingInterviewsArgs, '{"withinDays": 3}')).toEqual({ ok: true, data: { withinDays: 3 } });
  });

  it("is forgiving about status case", () => {
    expect(parseToolArgs(searchApplicationsArgs, { status: " Applied " })).toMatchObject({ ok: true, data: { status: "applied" } });
  });

  it("returns the short error the model can recover from", () => {
    expect(parseToolArgs(upcomingInterviewsArgs, { withinDays: 31 })).toEqual({ ok: false, error: "withinDays must be 1-30" });
    expect(parseToolArgs(upcomingInterviewsArgs, { withinDays: 0 })).toEqual({ ok: false, error: "withinDays must be 1-30" });
    expect(parseToolArgs(upcomingInterviewsArgs, { withinDays: 2.5 })).toEqual({ ok: false, error: "withinDays must be 1-30" });
    expect(parseToolArgs(upcomingInterviewsArgs, { withinDays: "soon" })).toEqual({ ok: false, error: "withinDays must be 1-30" });
    expect(parseToolArgs(searchApplicationsArgs, { limit: 21 })).toMatchObject({ ok: false, error: "limit must be 1-20" });
    expect(parseToolArgs(searchApplicationsArgs, { query: "a".repeat(101) })).toEqual({ ok: false, error: "query must be at most 100 characters" });
  });

  it("lists the valid statuses when the status is wrong", () => {
    const r = parseToolArgs(searchApplicationsArgs, { status: "ghosted" });
    expect(r.ok).toBe(false);
    for (const s of STATUSES) expect(!r.ok && r.error).toContain(s);
  });

  it("rejects non-object arguments", () => {
    for (const bad of ["not json", [1], 42]) {
      expect(parseToolArgs(searchApplicationsArgs, bad)).toEqual({ ok: false, error: "Arguments must be a JSON object" });
    }
  });

  it("ignores a userId the model tries to pass: the user is bound by the server", () => {
    const r = parseToolArgs(searchApplicationsArgs, { userId: 999, query: "acme" });
    expect(r.ok && "userId" in r.data).toBe(false);
  });
});

describe("generated SQL (built, never executed)", () => {
  it("search: binds userId, escapes wildcards, newest first, limited, only the allowed columns", () => {
    const { sql, params } = buildSearchQuery(5, { query: "50%_off", status: "offer", limit: 3 }).toSQL();
    expect(sql).toMatch(/^select "id", "company", "role", "status", "location", "salary_text", "interview_at" from "applications"/);
    expect(sql).toContain('"applications"."user_id" = $1');
    expect(sql).toContain('"company" ilike');
    expect(sql).toContain('"role" ilike');
    expect(sql).toContain('order by "applications"."created_at" desc');
    expect(params[0]).toBe(5);
    expect(params).toContain("%50\\%\\_off%"); // wildcards escaped inside the pattern
    expect(params).toContain("offer");
    expect(params).toContain(3);
  });

  it("search: without query/status it still filters by userId and has no ilike", () => {
    const { sql } = buildSearchQuery(5, { limit: 10 }).toSQL();
    expect(sql).toContain('"user_id" = $1');
    expect(sql).not.toContain("ilike");
  });

  it("interviews: binds userId, bounds the time range, soonest first, max 20", () => {
    const now = new Date("2026-11-21T10:00:00Z");
    const { sql, params } = buildInterviewsQuery(5, { withinDays: 7 }, now).toSQL();
    expect(sql).toContain('"applications"."user_id" = $1');
    expect(sql).toContain('"interview_at" >=');
    expect(sql).toContain('"interview_at" <=');
    expect(sql).toContain('order by "applications"."interview_at" asc');
    expect(params[0]).toBe(5);
    expect(params).toContain(20);
    expect(params.map(String).join(" ")).toContain("2026-11-28");
  });
});

describe("results", () => {
  it("empty result carries an explicit message so the model doesn't invent rows", () => {
    expect(toToolResult([])).toEqual({ results: [], message: NO_MATCH_MESSAGE });
    expect(NO_MATCH_MESSAGE).toBe("No matching applications.");
  });

  it("returns ISO and IST strings, null when there is no interview, and no extra fields", () => {
    const base = { id: 1, company: "Acme", role: "Dev", status: "interview", location: "Pune", salaryText: null };
    const r = toToolResult([
      { ...base, interviewAt: new Date("2026-11-24T09:30:00Z") },
      { ...base, id: 2, interviewAt: null },
    ]);
    expect(r).toEqual({
      results: [
        { ...base, interviewAt: "2026-11-24T09:30:00.000Z", interviewAtLocal: "24 Nov 2026, 3:00 pm" },
        { ...base, id: 2, interviewAt: null, interviewAtLocal: null },
      ],
    });
  });
});

describe("runTool", () => {
  it("returns { error } for bad args without touching the database", async () => {
    expect(await runTool("upcoming_interviews", 1, { withinDays: 99 })).toEqual({ error: "withinDays must be 1-30" });
    expect(await runTool("search_applications", 1, { limit: 0 })).toMatchObject({ error: "limit must be 1-20" });
  });

  it("returns { error } for an unknown tool", async () => {
    expect(await runTool("delete_everything", 1, {})).toEqual({ error: "Unknown tool: delete_everything" });
  });
});

describe("tool definitions shown to the model", () => {
  const byName = Object.fromEntries(toolDefinitions.map((t) => [t.name, t.parameters.properties])) as Record<string, Record<string, Record<string, unknown>>>;

  it("stay in sync with the validation rules", () => {
    expect(byName.search_applications.status.enum).toEqual([...STATUSES]);
    expect(byName.search_applications.limit).toMatchObject({ minimum: 1, maximum: 20, default: 10 });
    expect(byName.search_applications.query.maxLength).toBe(100);
    expect(byName.upcoming_interviews.withinDays).toMatchObject({ minimum: 1, maximum: 30, default: 7 });
  });

  it("never expose userId as a parameter", () => {
    for (const props of Object.values(byName)) expect(Object.keys(props)).not.toContain("userId");
  });
});

describe("createChatTools", () => {
  it("exposes both tools with name, description, parameters and run", () => {
    const tools = createChatTools(1);
    expect(Object.keys(tools).sort()).toEqual(["search_applications", "upcoming_interviews"]);
    for (const [key, t] of Object.entries(tools)) {
      expect(t.name).toBe(key);
      expect(t.description.length).toBeGreaterThan(20);
      expect(typeof t.run).toBe("function");
    }
  });

  it("run({ withinDays: 999 }) returns the error object, with no DB access", async () => {
    expect(await createChatTools(1).upcoming_interviews.run({ withinDays: 999 })).toEqual({ error: "withinDays must be 1-30" });
  });

  it("run() with bad search args returns an error object too", async () => {
    expect(await createChatTools(1).search_applications.run({ limit: 0 })).toMatchObject({ error: "limit must be 1-20" });
  });
});
