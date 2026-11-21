import { searchApplications } from "@/lib/tools/search-applications";
import { upcomingInterviews } from "@/lib/tools/upcoming-interviews";
import type { ToolResult } from "@/lib/tools/format";
import { toolDefinitions, type ChatTool, type ToolName } from "@/lib/tools/definitions";

export { toolDefinitions };
export type { ChatTool, ToolName };

/** Runs a tool by name. Unknown tool or bad args come back as { error } so the model can recover. */
export async function runTool(name: string, userId: number, rawArgs: unknown, now: Date = new Date()): Promise<ToolResult> {
  switch (name) {
    case "search_applications":
      return searchApplications(userId, rawArgs);
    case "upcoming_interviews":
      return upcomingInterviews(userId, rawArgs, now);
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

/**
 * The tools bound to ONE user. The chat endpoint calls this with the session's user id, so the
 * model never chooses whose data it reads. `clock` is injectable for tests.
 *
 *   const tools = createChatTools(user.id);
 *   await tools.upcoming_interviews.run({ withinDays: 7 });
 */
export function createChatTools(userId: number, clock: () => Date = () => new Date()): Record<ToolName, ChatTool> {
  const entries = toolDefinitions.map((def) => [
    def.name,
    { ...def, run: (args: unknown) => runTool(def.name, userId, args, clock()) },
  ]);
  return Object.fromEntries(entries) as Record<ToolName, ChatTool>;
}
