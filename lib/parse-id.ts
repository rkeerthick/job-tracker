// Strict: "12" only. Rejects "", "1.5", "1e3", "-1", "abc", "0".
export function parseId(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
