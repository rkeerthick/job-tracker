import type { ApplicationFormValues } from "@/components/ApplicationFields";
import type { Application } from "@/lib/applications";
import { isoToLocalInput, localInputToIso } from "@/lib/datetime-local";
import { joinSkills, splitSkills } from "@/lib/skills";

/** An existing application -> what the Edit form's inputs start with. */
export function valuesFromApplication(app: Application): ApplicationFormValues {
  return {
    company: app.company,
    role: app.role,
    link: app.link ?? "",
    location: app.location ?? "",
    salaryText: app.salaryText ?? "",
    skillsText: joinSkills(app.skills ?? []),
    interviewAt: isoToLocalInput(app.interviewAt?.toISOString()),
  };
}

export type UpdatePayload = {
  company?: string;
  role?: string;
  link?: string | null;
  location?: string | null;
  salaryText?: string | null;
  skills?: string[];
  interviewAt?: string | null;
};

const blankToNull = (s: string) => (s.trim() === "" ? null : s.trim());

/**
 * PATCH body with ONLY the fields the user changed (so an edit never overwrites a value another
 * tab changed, and untouched fields are not re-sent). A cleared optional field is sent as null,
 * which means "clear it"; an unchanged one is left out, which means "leave it".
 * Skills have no null: an emptied list is sent as [].
 */
export function buildUpdatePayload(initial: ApplicationFormValues, current: ApplicationFormValues): UpdatePayload {
  const out: UpdatePayload = {};
  if (current.company.trim() !== initial.company.trim()) out.company = current.company.trim();
  if (current.role.trim() !== initial.role.trim()) out.role = current.role.trim();
  if (current.link.trim() !== initial.link.trim()) out.link = blankToNull(current.link);
  if (current.location.trim() !== initial.location.trim()) out.location = blankToNull(current.location);
  if (current.salaryText.trim() !== initial.salaryText.trim()) out.salaryText = blankToNull(current.salaryText);
  if (splitSkills(current.skillsText).join("\n") !== splitSkills(initial.skillsText).join("\n")) {
    out.skills = splitSkills(current.skillsText);
  }
  // Compare the input strings, not the converted instants: an untouched field is never re-sent.
  if (current.interviewAt !== initial.interviewAt) out.interviewAt = localInputToIso(current.interviewAt);
  return out;
}
