/** Joins class names, skipping falsy values. (Variants are written not to conflict, so no tailwind-merge.) */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
