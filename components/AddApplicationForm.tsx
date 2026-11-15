"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export function AddApplicationForm() {
  const router = useRouter();
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [link, setLink] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return; // guard against double submit (Enter key + click)
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company, role, link }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
          fieldErrors?: Record<string, string[]>;
        } | null;
        // Prefer the first specific field message ("Link must be a valid http(s) URL").
        const firstField = body?.fieldErrors && Object.values(body.fieldErrors).flat()[0];
        setError(firstField ?? body?.error ?? "Something went wrong");
        return;
      }

      setCompany("");
      setRole("");
      setLink("");
      router.refresh(); // re-run the server component so the new card shows up
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <Input
          label="Company"
          placeholder="Acme"
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          required
        />
        <Input
          label="Role"
          placeholder="Frontend Developer"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          required
        />
        <Input
          label="Link (optional)"
          placeholder="https://…"
          value={link}
          onChange={(e) => setLink(e.target.value)}
        />
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={submitting}>
          {submitting ? "Adding…" : "Add application"}
        </Button>
        {error && <Alert className="flex-1 py-1.5">{error}</Alert>}
      </div>
    </form>
  );
}
