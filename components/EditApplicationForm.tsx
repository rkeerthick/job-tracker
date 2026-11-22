"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { ApplicationFields, type ApplicationFormValues } from "@/components/ApplicationFields";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import type { Application } from "@/lib/applications";
import { buildUpdatePayload, valuesFromApplication } from "@/lib/application-form";
import { readError } from "@/lib/read-error";

/** Edit form shown inside the card. Sends only the changed fields; a cleared optional field is sent as null. */
export function EditApplicationForm({ app, onClose }: { app: Application; onClose: () => void }) {
  const router = useRouter();
  const [initial] = useState(() => valuesFromApplication(app)); // what the inputs started with: the baseline for "changed"
  const [values, setValues] = useState<ApplicationFormValues>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inflight = useRef(false); // state is async: a ref blocks a double submit (Enter + click)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (inflight.current) return;

    const payload = buildUpdatePayload(initial, values);
    if (Object.keys(payload).length === 0) {
      onClose(); // nothing changed: no request (the API would reject an empty PATCH anyway)
      return;
    }

    inflight.current = true;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/applications/${app.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.status === 401) {
        router.push("/login");
        return;
      }
      if (!res.ok) {
        setError(await readError(res, "Could not save changes"));
        return; // stay in edit mode with the user's input intact
      }

      router.refresh(); // re-render the board with the saved data
      onClose();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      inflight.current = false;
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} aria-label={`Edit ${app.company}`} className="flex min-w-0 flex-col gap-3">
      <ApplicationFields layout="narrow" values={values} onChange={(patch) => setValues((v) => ({ ...v, ...patch }))} disabled={saving} />
      {error && <Alert>{error}</Alert>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={saving} aria-busy={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
