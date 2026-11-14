import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { applications } from "@/db/schema";

export type Application = typeof applications.$inferSelect;

/** All of one user's applications, newest first. Shared by the API route and pages. */
export async function listApplications(userId: number): Promise<Application[]> {
  // id breaks ties between rows with the same timestamp.
  return db
    .select()
    .from(applications)
    .where(eq(applications.userId, userId))
    .orderBy(desc(applications.createdAt), desc(applications.id));
}
