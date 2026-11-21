import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";

// "/" has no content of its own: the app lives at /applications.
export default function Home() {
  // Cookie access must sit inside <Suspense> (cacheComponents): the shell is
  // prerendered, the user-specific redirect happens at request time.
  return (
    <Suspense fallback={<p className="p-6 text-sm text-muted">Loading…</p>}>
      <GoToApp />
    </Suspense>
  );
}

async function GoToApp(): Promise<never> {
  // The real auth check (proxy.ts only checks that a cookie exists).
  const user = await getCurrentUser();
  if (user) redirect("/applications");
  redirect("/login");
}
