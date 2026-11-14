import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { listApplications } from "@/lib/applications";
import { AddApplicationForm } from "@/components/AddApplicationForm";
import { StatusSelect } from "@/components/StatusSelect";
import { STATUSES } from "@/lib/statuses";

export const metadata: Metadata = {
  title: "My applications",
};

const columns = STATUSES; // ["saved","applied","interview","offer","rejected"]

export default function ApplicationsPage() {
  return (
    <main>
      <h1>My applications</h1>
      <AddApplicationForm />
      {/* cacheComponents: cookie + DB access must be inside <Suspense> */}
      <Suspense fallback={<p>Loading…</p>}>
        <Board />
      </Suspense>
    </main>
  );
}

async function Board() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const apps = await listApplications(user.id);

  return (
    <div style={{ display: "flex", gap: 16 }}>
      {columns.map((status) => (
        <section key={status}>
          <h2>{status}</h2>
          {apps
            .filter((a) => a.status === status)
            .map((a) => (
              <div key={a.id}>
                <strong>{a.company}</strong>
                <div>{a.role}</div>
                <StatusSelect id={a.id} status={a.status} />
              </div>
            ))}
        </section>
      ))}
    </div>
  );
}
