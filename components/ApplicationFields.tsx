import { Input } from "@/components/ui/Input";

/** What the form fields hold: all strings, exactly as typed. Conversion to API values happens in toPayload. */
export type ApplicationFormValues = {
  company: string;
  role: string;
  link: string;
  location: string;
  salaryText: string;
  skillsText: string; // comma separated
  interviewAt: string; // datetime-local value, "" when empty (see lib/datetime-local.ts)
};

export const emptyApplicationValues: ApplicationFormValues = {
  company: "", role: "", link: "", location: "", salaryText: "", skillsText: "", interviewAt: "",
};

/**
 * The shared input grid for the Add and Edit forms. Controlled: the parent owns the values and
 * receives a partial update on every change.
 */
export function ApplicationFields({
  values,
  onChange,
  disabled,
  layout = "wide",
}: {
  values: ApplicationFormValues;
  onChange: (patch: Partial<ApplicationFormValues>) => void;
  disabled?: boolean;
  /** "wide": 1-3 columns by screen width (Add form). "narrow": always one column (inside a card). */
  layout?: "wide" | "narrow";
}) {
  // grid-cols-1 is minmax(0, 1fr): without it the column grows to the inputs' default width and overflows a narrow card.
  return (
    <div className={layout === "narrow" ? "grid grid-cols-1 gap-3" : "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"}>
      <Input label="Company" placeholder="Acme" value={values.company} onChange={(e) => onChange({ company: e.target.value })} required maxLength={255} disabled={disabled} />
      <Input label="Role" placeholder="Frontend Developer" value={values.role} onChange={(e) => onChange({ role: e.target.value })} required maxLength={255} disabled={disabled} />
      <Input label="Link (optional)" type="url" placeholder="https://…" value={values.link} onChange={(e) => onChange({ link: e.target.value })} disabled={disabled} />
      <Input label="Location" placeholder="Bengaluru" value={values.location} onChange={(e) => onChange({ location: e.target.value })} maxLength={255} disabled={disabled} />
      <Input label="Salary" placeholder="₹12–18 LPA" value={values.salaryText} onChange={(e) => onChange({ salaryText: e.target.value })} maxLength={255} disabled={disabled} />
      <Input label="Skills (comma separated)" placeholder="React, TypeScript" value={values.skillsText} onChange={(e) => onChange({ skillsText: e.target.value })} disabled={disabled} />
      <Input label="Interview (optional)" type="datetime-local" value={values.interviewAt} onChange={(e) => onChange({ interviewAt: e.target.value })} disabled={disabled} />
    </div>
  );
}
