import { and, asc, eq, gte, lte } from "drizzle-orm";
import { db } from "@/db";
import { applications } from "@/db/schema";
import { parseToolArgs, upcomingInterviewsArgs, type UpcomingInterviewsArgs } from "@/lib/tools/args";
import { toolColumns, toToolResult, type ToolResult } from "@/lib/tools/format";
import { interviewWindow } from "@/lib/tools/time";

const MAX_RESULTS = 20;

/** Builds (does not run) the query. Rows with no interviewAt never match the range. */
export function buildInterviewsQuery(userId: number, args: UpcomingInterviewsArgs, now: Date) {
  const { from, to } = interviewWindow(now, args.withinDays);

  return db
    .select(toolColumns)
    .from(applications)
    .where(
      and(
        eq(applications.userId, userId),
        gte(applications.interviewAt, from),
        lte(applications.interviewAt, to),
      ),
    )
    .orderBy(asc(applications.interviewAt), asc(applications.id))
    .limit(MAX_RESULTS);
}

/** `now` is injectable for tests; defaults to the real time. */
export async function upcomingInterviews(userId: number, rawArgs: unknown, now: Date = new Date()): Promise<ToolResult> {
  const parsed = parseToolArgs(upcomingInterviewsArgs, rawArgs);
  if (!parsed.ok) return { error: parsed.error };
  return toToolResult(await buildInterviewsQuery(userId, parsed.data, now));
}
