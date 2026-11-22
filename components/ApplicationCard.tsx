"use client";

import { useState } from "react";
import { EditApplicationForm } from "@/components/EditApplicationForm";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { NotesPanel } from "@/components/NotesPanel";
import { StatusSelect } from "@/components/StatusSelect";
import type { Application } from "@/lib/applications";
import { formatInterviewIST } from "@/lib/tools/time";

const dateFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC", // same output on server and in tests, whatever the machine's zone
});

// Only ever link to http(s): never render a javascript: href, even from bad old data.
const isHttpUrl = (url: string) => /^https?:\/\//i.test(url);

export function ApplicationCard({ app }: { app: Application }) {
  const [editing, setEditing] = useState(false);

  // appliedAt isn't set by the add form yet, so fall back to when the card was added.
  const date = app.appliedAt ?? app.createdAt;
  const dateLabel = app.appliedAt ? "Applied" : "Added";

  return (
    <Card className="flex flex-col gap-2 p-3">
      {editing ? (
        <EditApplicationForm app={app} onClose={() => setEditing(false)} />
      ) : (
        <>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="wrap-break-word font-semibold">{app.company}</p>
              <p className="wrap-break-word text-sm text-muted">{app.role}</p>
            </div>

            <div className="flex shrink-0 items-center gap-1">
              {app.link && isHttpUrl(app.link) && (
                <a
                  href={app.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Open job posting for ${app.company} (new tab)`}
                  className="shrink-0 rounded p-1 text-muted transition-colors hover:text-accent-text"
                >
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                    <path d="M15 3h6v6" />
                    <path d="M10 14 21 3" />
                  </svg>
                </a>
              )}
              <Button variant="secondary" size="sm" onClick={() => setEditing(true)} aria-label={`Edit ${app.company}`}>
                Edit
              </Button>
            </div>
          </div>

          {(app.location || app.salaryText) && (
            <p className="wrap-break-word text-xs text-muted">
              {[app.location, app.salaryText].filter(Boolean).join(" · ")}
            </p>
          )}

          {app.interviewAt && (
            <p className="text-xs font-medium">Interview: {formatInterviewIST(app.interviewAt)}</p>
          )}

          <p className="text-xs text-muted">
            {dateLabel} {dateFormat.format(date)}
          </p>
        </>
      )}

      <StatusSelect id={app.id} status={app.status} />
      <NotesPanel applicationId={app.id} />
    </Card>
  );
}
