import Link from "next/link";
import { LogoutButton } from "@/app/logout-button";

// App shell for the signed-in area. Static (no cookie access), so it prerenders;
// the per-user data is streamed in by the pages inside <Suspense>.
export default function ApplicationsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <Link href="/applications" className="text-lg font-semibold">
            Job Tracker
          </Link>
          {/* Server Action: destroySession() -> redirect("/login") */}
          <LogoutButton />
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl px-4 py-6">{children}</main>
    </>
  );
}
