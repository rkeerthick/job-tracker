"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Note = { id: number; body: string; createdAt: string };

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
    <div>
      <button type="button" onClick={toggle} aria-expanded={open}>
        {open ? "Hide notes" : "Notes"}
      </button>

      {open && (
        <div>
          {loading && notes === null && <p>Loading…</p>}
          {loadError && (
            <p role="alert">
              {loadError} <button type="button" onClick={loadNotes}>Retry</button>
            </p>
          )}

          {notes && notes.length === 0 && <p>No notes yet.</p>}
          {notes && notes.length > 0 && (
            <ul>
              {notes.map((n) => (
                <li key={n.id}>
                  {n.body}{" "}
                  <button
                    type="button"
                    onClick={() => handleDelete(n.id)}
                    disabled={deletingId !== null}
                    aria-label="Delete note"
                  >
                    {deletingId === n.id ? "…" : "✕"}
                  </button>
                </li>
              ))}
            </ul>
          )}

          <form onSubmit={handleAdd}>
            <textarea
              placeholder="Add a note"
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={2000}
              required
            />
            <button type="submit" disabled={submitting}>
              {submitting ? "Adding…" : "Add note"}
            </button>
          </form>
          {error && <p role="alert">{error}</p>}
        </div>
      )}
    </div>
  );
}
