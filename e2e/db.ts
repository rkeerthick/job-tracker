import { neon } from "@neondatabase/serverless";
import { requireE2eDatabaseUrl } from "./env";

/** Direct access to the e2e database, to check what the app wrote. Refuses to connect anywhere else. */
export const e2eSql = () => neon(requireE2eDatabaseUrl());

export async function countUsersByEmail(email: string): Promise<number> {
  const rows = await e2eSql()`SELECT count(*)::int AS n FROM users WHERE email = ${email}`;
  return rows[0].n as number;
}

export async function applicationsOf(email: string) {
  return e2eSql()`
    SELECT a.company, a.role, a.status
    FROM applications a JOIN users u ON u.id = a.user_id
    WHERE u.email = ${email}`;
}
