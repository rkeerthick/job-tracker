// Structured JSON logging: one JSON object per line, so Vercel -> Logs can filter/search it.
// Pure module (no Next, no DB). Secrets are redacted by key name as a safety net,
// but the real rule is: don't pass passwords, tokens or cookies in `fields` at all.

export type LogLevel = "debug" | "info" | "warn" | "error";

// Matches keys like password, passwordHash, token, tokenHash, cookie, authorization, secret, DATABASE_URL.
const SENSITIVE_KEY = /pass(word)?|token|secret|cookie|authorization|hash|database_?url|connection/i;
const MAX_DEPTH = 4;

/** Error -> plain object. Drops the "params: ..." tail drizzle puts in query error messages (user data). */
export function serializeError(err: unknown): unknown {
  if (!(err instanceof Error)) return err;
  const out: Record<string, unknown> = {
    name: err.name,
    message: err.message.split("\nparams:")[0].slice(0, 500),
  };
  const code = (err as { code?: unknown }).code ?? (err.cause as { code?: unknown } | undefined)?.code;
  if (code !== undefined) out.code = code;
  if (err.stack) out.stack = err.stack.split("\n").slice(0, 6).join("\n");
  return out;
}

function sanitize(value: unknown, depth = 0): unknown {
  if (value instanceof Error) return serializeError(value);
  if (value === null || typeof value !== "object") return value;
  if (depth >= MAX_DEPTH) return "[truncated]";
  if (Array.isArray(value)) return value.map((v) => sanitize(v, depth + 1));

  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value)) {
    out[key] = SENSITIVE_KEY.test(key) ? "[redacted]" : sanitize(v, depth + 1);
  }
  return out;
}

export function log(level: LogLevel, message: string, fields: Record<string, unknown> = {}): void {
  const line = JSON.stringify({
    ...(sanitize(fields) as Record<string, unknown>),
    level, // set last so fields can't overwrite them
    message,
    time: new Date().toISOString(),
  });

  // Separate streams so Vercel shows the right severity.
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}
