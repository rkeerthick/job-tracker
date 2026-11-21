// Pure: no DB, so the chat harness and tests can load the tool schemas without a database client.
import { STATUSES } from "@/lib/statuses";
import type { ToolResult } from "@/lib/tools/format";

/**
 * What the model sees. Hand-written (not generated) so the descriptions can guide the model.
 * userId is not a parameter: the server binds it from the session.
 */
export const toolDefinitions = [
  {
    name: "search_applications",
    description:
      "Search the signed-in user's job applications by company or role text and/or status. Newest first. Returns at most `limit` rows.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", maxLength: 100, description: "Text to look for in company or role (case-insensitive)." },
        status: { type: "string", enum: [...STATUSES], description: "Only applications in this stage." },
        limit: { type: "integer", minimum: 1, maximum: 20, default: 10, description: "Max rows to return." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "upcoming_interviews",
    description:
      "List the user's interviews scheduled from now until `withinDays` days ahead, soonest first. Each row has interviewAtLocal (IST): quote that exactly, do not convert times yourself.",
    parameters: {
      type: "object",
      properties: {
        withinDays: { type: "integer", minimum: 1, maximum: 30, default: 7, description: "How many days ahead to look." },
      },
      additionalProperties: false,
    },
  },
] as const;

export type ToolName = (typeof toolDefinitions)[number]["name"];

export type ChatTool = {
  name: ToolName;
  description: string;
  parameters: object;
  /** Validates the (untrusted) args, then runs the query for the bound user. */
  run: (args: unknown) => Promise<ToolResult>;
};
