import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { LogoutButton } from "./logout-button";

export default async function Home() {
  // The real auth check — proxy.ts only checks that a cookie exists.
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Job Tracker</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-600">{user.email}</span>
          <LogoutButton />
        </div>
      </header>
    </main>
  );
}
