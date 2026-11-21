import { and, desc, eq, ilike, or } from "drizzle-orm";
import { db } from "@/db";
import { applications } from "@/db/schema";
import { escapeLike } from "@/lib/tools/like";
import { parseToolArgs, searchApplicationsArgs, type SearchApplicationsArgs } from "@/lib/tools/args";
import { toolColumns, toToolResult, type ToolResult } from "@/lib/tools/format";

/** Builds (does not run) the query, so tests can inspect the SQL. userId is bound, never model-supplied. */
export function buildSearchQuery(userId: number, args: SearchApplicationsArgs) {
  const pattern = args.query ? `%${escapeLike(args.query)}%` : undefined;

  return db
    .select(toolColumns)
    .from(applications)
    .where(
      and(
        eq(applications.userId, userId),
        pattern ? or(ilike(applications.company, pattern), ilike(applications.role, pattern)) : undefined,
        args.status ? eq(applications.status, args.status) : undefined,
      ),
    )
    .orderBy(desc(applications.createdAt), desc(applications.id))
    .limit(args.limit);
}

export async function searchApplications(userId: number, rawArgs: unknown): Promise<ToolResult> {
  const parsed = parseToolArgs(searchApplicationsArgs, rawArgs);
  if (!parsed.ok) return { error: parsed.error };
  return toToolResult(await buildSearchQuery(userId, parsed.data));
}
