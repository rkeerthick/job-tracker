import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

type RequireUserResult =
  | { user: CurrentUser; error: null }
  | { user: null; error: NextResponse };

/**
 * Auth guard for Route Handlers. Call it on the first line of every protected route:
 *
 *   const { user, error } = await requireUser();
 *   if (error) return error;
 *   // `user` is non-null from here on
 *
 * This is the real check (DB-backed session lookup) — don't rely on proxy.ts.
 */
export async function requireUser(): Promise<RequireUserResult> {
  const user = await getCurrentUser();
  if (!user) {
    return {
      user: null,
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  return { user, error: null };
}
