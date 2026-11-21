/**
 * Escape LIKE/ILIKE wildcards so user (or model) text is matched literally:
 * "50%" must not match everything, "_" must not match any single character.
 * Postgres uses backslash as the default escape character.
 */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, "\\$&");
}
