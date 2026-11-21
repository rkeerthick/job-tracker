// Pure date helpers for the chat tools. No DB, no Next.

const IST = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  dateStyle: "medium",
  timeStyle: "short",
});

/** "24 Nov 2026, 3:00 pm" in IST. The model quotes this instead of converting time zones itself. */
export function formatIST(d: Date): string {
  return IST.format(d);
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * [now, now + withinDays days]. `now` is injected so this stays pure and testable.
 * IST has no daylight saving, so plain 24h arithmetic is exact for our users.
 */
export function interviewWindow(now: Date, withinDays: number): { from: Date; to: Date } {
  if (!Number.isFinite(withinDays)) throw new RangeError("withinDays must be a finite number");
  return {
    from: new Date(now.getTime()),
    to: new Date(now.getTime() + withinDays * DAY_MS),
  };
}
