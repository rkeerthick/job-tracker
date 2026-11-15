"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { STATUSES, type Status } from "@/lib/statuses";

export function StatusSelect({ id, status }: { id: number; status: Status }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newStatus = e.target.value as Status;
    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/applications/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });

      if (res.status === 401) {
        router.push("/login");
        return;
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Could not update status");
        return; // select stays on the old value: it's controlled by the `status` prop
      }

      router.refresh(); // card moves to its new column
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <select
        value={status}
        onChange={handleChange}
        disabled={saving}
        aria-label="Status"
        className="w-full rounded-md border border-border bg-surface px-2 py-1 text-sm capitalize text-text outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/40 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      {error && <Alert className="px-2 py-1 text-xs">{error}</Alert>}
    </div>
  );
}
