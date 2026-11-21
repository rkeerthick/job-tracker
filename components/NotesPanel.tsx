"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Input";

type Note = { id: number; body: string; createdAt: string };

const noteDate = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });

// Notes only render after the user opens the panel (client-side), so local time is safe here.
function formatNoteDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : noteDate.format(d);
}

export function NotesPanel({ applicationId }: { applicationId: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState<Note[] | null>(null); // null = not loaded yet
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const url = `/api/applications/${applicationId}/notes`;

  // Returns true when the response was handled as a 401 (caller should stop).
  function handleUnauthorized(res: Response): boolean {
    if (res.status !== 401) return false;
    router.push("/login");
    return true;
  }

  async function errorMessage(res: Response, fallback: string): Promise<string> {
    const body = (await res.json().catch(() => null)) as {
      error?: string;
      fieldErrors?: Record<string, string[]>;
    } | null;
    const firstField = body?.fieldErrors && Object.values(body.fieldErrors).flat()[0];
    return firstField ?? body?.error ?? fallback;
  }

  async function loadNotes() {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(url);
      if (handleUnauthorized(res)) return;
      if (!res.ok) {
        setLoadError(await errorMessage(res, "Could not load notes"));
        return;
      }
      setNotes((await res.json()) as Note[]);
    } catch {
      setLoadError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function toggle() {
    const next = !open;
    setOpen(next);
    // Lazy: only fetch the first time the panel opens.
    if (next && notes === null && !loading) void loadNotes();
  }

  async function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text }),
      });
      if (handleUnauthorized(res)) return;
      if (!res.ok) {
        setError(await errorMessage(res, "Could not add note"));
        return;
      }
      setText("");
      await loadNotes(); // list refresh
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(noteId: number) {
    if (deletingId !== null) return;
    setDeletingId(noteId);
    setError(null);
    try {
      const res = await fetch(`/api/notes/${noteId}`, { method: "DELETE" });
      if (handleUnauthorized(res)) return;
      if (!res.ok) {
        setError(await errorMessage(res, "Could not delete note"));
        return;
      }
      await loadNotes(); // list refresh
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button variant="secondary" size="sm" onClick={toggle} aria-expanded={open}>
        {open ? "Hide notes" : "Notes"}
      </Button>

      {open && (
        <div className="flex flex-col gap-2 border-t border-border pt-2">
          {loading && notes === null && <p className="text-sm text-muted">Loading…</p>}
          {loadError && (
            <Alert className="flex items-center justify-between gap-2 px-2 py-1.5">
              {loadError}
              <Button variant="secondary" size="sm" onClick={loadNotes}>
                Retry
              </Button>
            </Alert>
          )}

          {notes && notes.length === 0 && <p className="text-sm text-muted">No notes yet.</p>}
          {notes && notes.length > 0 && (
            <ul className="flex flex-col gap-2">
              {notes.map((n) => (
                <li key={n.id} className="flex items-start justify-between gap-2 text-sm">
                  <div className="min-w-0">
                    <p className="whitespace-pre-wrap wrap-break-word">{n.body}</p>
                    <time dateTime={n.createdAt} className="text-xs text-muted">
                      {formatNoteDate(n.createdAt)}
                    </time>
                  </div>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => handleDelete(n.id)}
                    disabled={deletingId !== null}
                    aria-label="Delete note"
                    className="shrink-0"
                  >
                    {deletingId === n.id ? "…" : "✕"}
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <form onSubmit={handleAdd} className="flex flex-col gap-2">
            <Textarea
              aria-label="Add a note"
              placeholder="Add a note"
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={2000}
              required
              className="min-h-16"
            />
            <Button type="submit" size="sm" disabled={submitting}>
              {submitting ? "Adding…" : "Add note"}
            </Button>
          </form>
          {error && <Alert className="px-2 py-1.5">{error}</Alert>}
        </div>
      )}
    </div>
  );
}
