type ErrorBody = { error?: string; fieldErrors?: Record<string, string[]> };

/** Prefer the first specific field message ("Link must be a valid http(s) URL"), then the API's message. */
export async function readError(res: Response, fallback: string): Promise<string> {
  const body = (await res.json().catch(() => null)) as ErrorBody | null;
  const firstField = body?.fieldErrors && Object.values(body.fieldErrors).flat()[0];
  return firstField ?? body?.error ?? fallback;
}
