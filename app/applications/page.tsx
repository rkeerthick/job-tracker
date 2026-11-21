import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { listApplications } from "@/lib/applications";
import { AddApplicationForm } from "@/components/AddApplicationForm";
import { ChatPanel } from "@/components/ChatPanel";
import { ApplicationCard } from "@/components/ApplicationCard";
import { Card } from "@/components/ui/Card";
import { STATUSES, type Status } from "@/lib/statuses";

export const metadata: Metadata = {
  title: "My applications",
};

const columns = STATUSES; // ["saved","applied","interview","offer","rejected"]

export default function ApplicationsPage() {
  // Header, container and Logout live in app/applications/layout.tsx.
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">My applications</h1>

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-muted">Add application</h2>
        <AddApplicationForm />
      </Card>

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-muted">Ask about your applications</h2>
        <ChatPanel />
      </Card>

      {/* cacheComponents: cookie + DB access must be inside <Suspense> */}
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <Board />
      </Suspense>
    </div>
  );
}

// Written out in full so Tailwind sees the class names. Colours are the muted --status-* tokens.
const columnTop: Record<Status, string> = {
  saved: "border-t-status-saved",
  applied: "border-t-status-applied",
  interview: "border-t-status-interview",
  offer: "border-t-status-offer",
  rejected: "border-t-status-rejected",
};

async function Board() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const apps = await listApplications(user.id);

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
      {columns.map((status) => {
        const items = apps.filter((a) => a.status === status);
        return (
          <section
            key={status}
            className={`flex flex-col gap-3 rounded-lg border border-t-2 border-border p-3 ${columnTop[status]}`}
          >
            <h2 className="flex items-center justify-between text-sm font-semibold">
              <span className="capitalize">{status}</span>
              <span
                className="rounded-full bg-border px-2 py-0.5 text-xs font-medium text-muted"
                aria-label={`${items.length} applications`}
              >
                {items.length}
              </span>
            </h2>

            {items.length === 0 ? (
              <p className="py-2 text-sm text-muted">No applications yet</p>
            ) : (
              items.map((a) => <ApplicationCard key={a.id} app={a} />)
            )}
          </section>
        );
      })}
    </div>
  );
}
