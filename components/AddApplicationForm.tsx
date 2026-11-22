"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Input";
import { ApplicationFields, emptyApplicationValues, type ApplicationFormValues } from "@/components/ApplicationFields";
import { localInputToIso } from "@/lib/datetime-local";
import { readError } from "@/lib/read-error";
import { joinSkills, splitSkills } from "@/lib/skills";

const MIN_POST_LENGTH = 20; // same minimum as POST /api/extract

export function AddApplicationForm() {
  const router = useRouter();

  const [postText, setPostText] = useState("");
  const [values, setValues] = useState<ApplicationFormValues>(emptyApplicationValues);
  const patchValues = (patch: Partial<ApplicationFormValues>) => setValues((v) => ({ ...v, ...patch }));

  // Extract (AI) and Add (save) have their own state, error and disabled logic.
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const busy = extracting || submitting;
  // State updates are async, so two very fast clicks could both see busy === false.
  // A ref flips immediately: only ONE request (extract or save) can be in flight.
  const inflight = useRef(false);

  async function handleExtract() {
    if (inflight.current) return;
    inflight.current = true;
    setExtracting(true);
    setExtractError(null);

    try {
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: postText }),
      });

      if (res.status === 401) {
        router.push("/login");
        return;
      }
      if (!res.ok) {
        // 422 (couldn't read it) / 503 (AI busy) / 400: show the message and leave the form
        // untouched, so the user can fill it in by hand.
        setExtractError(await readError(res, "Could not extract. Fill the form manually."));
        return;
      }

      const { data } = (await res.json()) as {
        data: { company: string | null; role: string | null; location: string | null; salaryText: string | null; skills: string[] };
      };
      // link and interviewAt are NOT extracted: the user types them.
      patchValues({
        company: data.company ?? "",
        role: data.role ?? "",
        location: data.location ?? "",
        salaryText: data.salaryText ?? "",
        skillsText: joinSkills(data.skills),
      });
    } catch {
      setExtractError("Network error. Please try again.");
    } finally {
      inflight.current = false;
      setExtracting(false);
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (inflight.current) return; // guard against double submit (Enter key + click) and saving mid-extraction
    inflight.current = true;
    setSubmitting(true);
    setError(null);

    try {
      const { company, role, link, location, salaryText } = values;
      const skills = splitSkills(values.skillsText);
      const res = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Empty strings are treated as "not provided" by the API.
        // datetime-local has no zone: convert with the browser's zone to an absolute instant (or null).
        body: JSON.stringify({ company, role, link, location, salaryText, interviewAt: localInputToIso(values.interviewAt), ...(skills.length > 0 && { skills }) }),
      });

      if (!res.ok) {
        setError(await readError(res, "Something went wrong"));
        return;
      }

      setPostText("");
      setValues(emptyApplicationValues);
      setExtractError(null);
      router.refresh(); // re-run the server component so the new card shows up
    } catch {
      setError("Network error. Please try again.");
    } finally {
      inflight.current = false;
      setSubmitting(false);
    }
  }

  const canExtract = postText.trim().length >= MIN_POST_LENGTH && !busy;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {/* Optional shortcut: paste a posting, let AI fill the fields below. */}
      <div className="flex flex-col gap-2">
        <Textarea
          label="Paste job post (optional)"
          placeholder="Paste the full job posting here, then click Extract to fill the fields below."
          value={postText}
          onChange={(e) => setPostText(e.target.value)}
          maxLength={20000}
          disabled={extracting}
          className="min-h-28"
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="secondary" onClick={handleExtract} disabled={!canExtract} aria-busy={extracting}>
            {extracting ? "Extracting…" : "Extract (AI)"}
          </Button>
          {extracting && <span className="text-sm text-muted">This can take a few seconds.</span>}
          {extractError && <Alert className="flex-1 py-1.5">{extractError}</Alert>}
        </div>
      </div>

      <ApplicationFields values={values} onChange={patchValues} disabled={extracting} />

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={busy}>
          {submitting ? "Adding…" : "Add application"}
        </Button>
        {error && <Alert className="flex-1 py-1.5">{error}</Alert>}
      </div>
    </form>
  );
}
