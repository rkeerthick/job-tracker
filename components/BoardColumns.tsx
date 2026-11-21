import { ApplicationCard } from "@/components/ApplicationCard";
import type { Application } from "@/lib/applications";
import { STATUSES, type Status } from "@/lib/statuses";

const columns = STATUSES; // ["saved","applied","interview","offer","rejected"]

// Written out in full so Tailwind sees the class names. Colours are the muted --status-* tokens.
const columnTop: Record<Status, string> = {
  saved: "border-t-status-saved",
  applied: "border-t-status-applied",
  interview: "border-t-status-interview",
  offer: "border-t-status-offer",
  rejected: "border-t-status-rejected",
};

/** The five status columns. Presentational: the page fetches the data and passes it in. */
export function BoardColumns({ apps }: { apps: Application[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
      {columns.map((status) => {
        const items = apps.filter((a) => a.status === status);
        return (
          <section
            key={status}
            aria-labelledby={`column-${status}`} // makes each column a named landmark: getByRole("region", { name: "saved" })
            className={`flex flex-col gap-3 rounded-lg border border-t-2 border-border p-3 ${columnTop[status]}`}
          >
            <h2 id={`column-${status}`} className="flex items-center justify-between text-sm font-semibold">
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
