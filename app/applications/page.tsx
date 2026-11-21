import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { listApplications } from "@/lib/applications";
import { AddApplicationForm } from "@/components/AddApplicationForm";
import { ChatPanel } from "@/components/ChatPanel";
import { BoardColumns } from "@/components/BoardColumns";
import { Card } from "@/components/ui/Card";

export const metadata: Metadata = {
  title: "My applications",
};

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

async function Board() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return <BoardColumns apps={await listApplications(user.id)} />;
}
