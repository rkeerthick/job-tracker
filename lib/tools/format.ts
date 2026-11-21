import { applications } from "@/db/schema";
import { formatIST } from "@/lib/tools/time";

/**
 * The ONLY columns a tool may return. Notes, link, skills, userId, passwordHash...
 * are not selected at all, so they can't reach the model by accident.
 */
export const toolColumns = {
  id: applications.id,
  company: applications.company,
  role: applications.role,
  status: applications.status,
  location: applications.location,
  salaryText: applications.salaryText,
  interviewAt: applications.interviewAt,
};

type Row = {
  id: number; company: string; role: string; status: string;
  location: string | null; salaryText: string | null; interviewAt: Date | null;
};

export type ToolRow = Omit<Row, "interviewAt"> & {
  interviewAt: string | null; // ISO, for machines
  interviewAtLocal: string | null; // "24 Nov 2026, 3:00 pm" IST, for the model to quote
};

export type ToolResult =
  | { results: ToolRow[]; message?: string }
  | { error: string };

export const NO_MATCH_MESSAGE = "No matching applications.";

export function toToolRow(r: Row): ToolRow {
  return {
    id: r.id,
    company: r.company,
    role: r.role,
    status: r.status,
    location: r.location,
    salaryText: r.salaryText,
    interviewAt: r.interviewAt ? r.interviewAt.toISOString() : null,
    interviewAtLocal: r.interviewAt ? formatIST(r.interviewAt) : null,
  };
}

/** Empty result gets an explicit message, so the model says "none found" instead of inventing rows. */
export function toToolResult(rows: Row[]): ToolResult {
  return rows.length === 0
    ? { results: [], message: NO_MATCH_MESSAGE }
    : { results: rows.map(toToolRow) };
}
