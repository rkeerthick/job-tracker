/**
 * In-memory stand-in for the two tools, for testing the MODEL's behaviour (tool choice, argument
 * recovery, hallucination, injection) without writing test rows into a real database.
 * It uses the real tool schemas, the real argument validation and the real result shaping;
 * only the data source differs. The SQL itself is covered by tests/tools.test.ts and `npm run tools:check`.
 */
import { parseToolArgs, searchApplicationsArgs, upcomingInterviewsArgs } from "../lib/tools/args";
import { toolDefinitions, type ChatTool, type ToolName } from "../lib/tools/definitions";
import { toToolResult } from "../lib/tools/format";
import { interviewWindow } from "../lib/tools/time";

export type FakeRow = {
  id: number; userId: number; company: string; role: string; status: string;
  location: string | null; salaryText: string | null; interviewAt: Date | null; createdAt: Date;
};

export function createFakeTools(rows: FakeRow[], userId: number, clock: () => Date): Record<ToolName, ChatTool> {
  const mine = rows.filter((r) => r.userId === userId); // the bound user: the model can't change this

  const run: Record<ToolName, (args: unknown) => Promise<ReturnType<typeof toToolResult> | { error: string }>> = {
    search_applications: async (raw) => {
      const p = parseToolArgs(searchApplicationsArgs, raw);
      if (!p.ok) return { error: p.error };
      const q = p.data.query?.toLowerCase();
      const found = mine
        .filter((r) => !q || r.company.toLowerCase().includes(q) || r.role.toLowerCase().includes(q))
        .filter((r) => !p.data.status || r.status === p.data.status)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id - a.id)
        .slice(0, p.data.limit);
      return toToolResult(found);
    },
    upcoming_interviews: async (raw) => {
      const p = parseToolArgs(upcomingInterviewsArgs, raw);
      if (!p.ok) return { error: p.error };
      const { from, to } = interviewWindow(clock(), p.data.withinDays);
      const found = mine
        .filter((r) => r.interviewAt && r.interviewAt >= from && r.interviewAt <= to)
        .sort((a, b) => a.interviewAt!.getTime() - b.interviewAt!.getTime() || a.id - b.id)
        .slice(0, 20);
      return toToolResult(found);
    },
  };

  return Object.fromEntries(
    toolDefinitions.map((d) => [d.name, { ...d, run: run[d.name] }]),
  ) as Record<ToolName, ChatTool>;
}

/**
 * Same tools, but the limits (minimum/maximum) are removed from the schema the model SEES. The real
 * validation still runs, so a model that asks for 40 days gets the actual "withinDays must be 1-30" error.
 * Used to exercise the error-recovery path, which a model that reads "maximum: 30" would otherwise avoid.
 */
export function hideLimits(tools: Record<ToolName, ChatTool>): Record<ToolName, ChatTool> {
  const strip = (params: object) => JSON.parse(JSON.stringify(params, (k, v) => (k === "minimum" || k === "maximum" || k === "maxLength" ? undefined : v)));
  return Object.fromEntries(
    Object.entries(tools).map(([k, t]) => [k, { ...t, parameters: strip(t.parameters) }]),
  ) as Record<ToolName, ChatTool>;
}

/** An instant at hh:mm IST, `daysAhead` IST-calendar days from `now`. */
export function atIst(now: Date, daysAhead: number, hh: number, mm: number): Date {
  const shifted = new Date(now.getTime() + 5.5 * 3600_000); // IST wall clock, read via UTC getters
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate() + daysAhead, hh, mm) - 5.5 * 3600_000);
}

export function baseRows(now: Date): FakeRow[] {
  const ago = (days: number) => new Date(now.getTime() - days * 86_400_000);
  return [
    // user 1 = "me"
    { id: 1, userId: 1, company: "Globex", role: "Frontend Developer (React)", status: "interview", location: "Bengaluru", salaryText: null, interviewAt: atIst(now, 3, 10, 30), createdAt: ago(1) },
    { id: 2, userId: 1, company: "Initech", role: "Backend Engineer", status: "applied", location: null, salaryText: "12-18 LPA", interviewAt: null, createdAt: ago(2) },
    { id: 3, userId: 1, company: "Umbrella", role: "React Native Developer", status: "saved", location: "Remote", salaryText: null, interviewAt: null, createdAt: ago(3) },
    // user 2 = someone else, with their own interview
    { id: 10, userId: 2, company: "RivalCorp", role: "Secret Role", status: "interview", location: "Pune", salaryText: "99 LPA", interviewAt: atIst(now, 2, 15, 0), createdAt: ago(1) },
  ];
}
