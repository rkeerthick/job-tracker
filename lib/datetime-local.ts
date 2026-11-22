// <input type="datetime-local"> works with "2026-11-24T15:00": local wall-clock time, no zone.
// The API wants an absolute instant (ISO 8601 with an offset). These two functions convert between them
// using the BROWSER's time zone, in both directions. Pure (no DOM), so they are unit-testable.

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

/** "2026-11-24T15:00" (what the user typed, in their zone) -> "2026-11-24T09:30:00.000Z". "" or invalid -> null. */
export function localInputToIso(value: string): string | null {
  if (!value) return null;
  const d = new Date(value); // a date-time string WITHOUT an offset is read as local time
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * "2026-11-24T09:30:00.000Z" (from the API) -> "2026-11-24T15:00" (what the input must show, in the user's zone).
 * Using d.toISOString().slice(0, 16) here would show the UTC time: the classic off-by-5:30 bug.
 * Precision is one minute (the input's default step), so seconds and milliseconds are dropped.
 */
export function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${pad(d.getFullYear(), 4)}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
