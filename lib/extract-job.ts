import { z } from "zod";
import { EXTRACTION_SYSTEM_PROMPT, extractionSchema, type Extraction } from "@/lib/extraction";

// Pure logic (no network, no DB): the model call is injected, so this is unit-testable.

export type Message = { role: "system" | "user" | "assistant"; content: string };
export type ModelCall = (messages: Message[]) => Promise<string>;

export type ExtractResult =
  | { ok: true; data: Extraction; attempts: number }
  // The app shows an editable form when extraction fails (Session 2), so keep what we know.
  | { ok: false; error: string; rawOutput: string; attempts: number };

const ALLOWED_KEYS = new Set(["type", "properties", "required", "additionalProperties", "items", "anyOf", "enum", "description"]);

function strip(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(strip);
  if (node && typeof node === "object") {
    return Object.fromEntries(
      Object.entries(node as Record<string, unknown>)
        // "properties" maps field NAMES to schemas: keep every name, strip inside each schema.
        .filter(([k]) => ALLOWED_KEYS.has(k))
        .map(([k, v]) => [k, k === "properties" ? Object.fromEntries(Object.entries(v as object).map(([n, s]) => [n, strip(s)])) : strip(v)]),
    );
  }
  return node;
}

/** JSON Schema for Groq strict mode: derived from the zod schema, minus keywords strict mode may not accept (minLength, $schema, ...). */
export function toStrictJsonSchema(): Record<string, unknown> {
  return strip(z.toJSONSchema(extractionSchema)) as Record<string, unknown>;
}

/** Models in json_object mode sometimes wrap JSON in ```json fences. */
function parseJson(raw: string): unknown {
  const unfenced = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(unfenced);
}

function validate(raw: string): { ok: true; data: Extraction } | { ok: false; error: string } {
  let json: unknown;
  try {
    json = parseJson(raw);
  } catch {
    return { ok: false, error: "Output was not valid JSON." };
  }
  const r = extractionSchema.safeParse(json);
  if (r.success) return { ok: true, data: r.data };
  const issues = r.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
  return { ok: false, error: `JSON did not match the schema: ${issues}` };
}

/** Extract once; if the output fails validation, retry ONCE, showing the model its error. */
export async function extractWithRetry(postText: string, callModel: ModelCall): Promise<ExtractResult> {
  const messages: Message[] = [
    { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
    { role: "user", content: postText },
  ];

  const first = await callModel(messages);
  const v1 = validate(first);
  if (v1.ok) return { ok: true, data: v1.data, attempts: 1 };

  const second = await callModel([
    ...messages,
    { role: "assistant", content: first },
    {
      role: "user",
      content: `Your previous output was invalid. ${v1.error}\nFix it. Return only the corrected JSON. Remember: if a value is not in the text, return null. Do not guess.`,
    },
  ]);
  const v2 = validate(second);
  if (v2.ok) return { ok: true, data: v2.data, attempts: 2 };

  return { ok: false, error: v2.error, rawOutput: second, attempts: 2 };
}
