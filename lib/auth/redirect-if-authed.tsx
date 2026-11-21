import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";

/**
 * Renders nothing; redirects logged-in users away from /login and /signup.
 * Reads cookies, so it must be wrapped in <Suspense> (cacheComponents is on) —
 * that keeps the rest of the page prerenderable.
 */
export async function RedirectIfAuthed() {
  if (await getCurrentUser()) redirect("/applications");
  return null;
}
