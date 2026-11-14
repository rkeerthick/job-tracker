// Plain array, no imports: safe for Client Components (db/schema.ts pulls in drizzle pg-core).
// db/schema.ts builds the Postgres enum from this, so the list lives in one place.
export const STATUSES = ["saved", "applied", "interview", "offer", "rejected"] as const;
export type Status = (typeof STATUSES)[number];
