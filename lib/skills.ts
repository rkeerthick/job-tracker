/** "React, TS,, " -> ["React", "TS"]: split on commas, trim, drop empties. */
export function splitSkills(text: string): string[] {
  return text.split(",").map((s) => s.trim()).filter(Boolean);
}

/** Inverse, for showing extracted skills in a text input. */
export function joinSkills(skills: string[]): string {
  return skills.join(", ");
}
