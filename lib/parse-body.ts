import { NextResponse } from "next/server";
import { z } from "zod";

type ParseResult<T> =
  | { data: T; error: null }
  | { data: null; error: NextResponse };

/**
 * Parses and validates a JSON request body. Never trust the raw body.
 *
 *   const { data, error } = await parseBody(request, createApplicationSchema);
 *   if (error) return error;   // 400
 */
export async function parseBody<S extends z.ZodType>(
  request: Request,
  schema: S,
): Promise<ParseResult<z.infer<S>>> {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return {
      data: null,
      error: NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 }),
    };
  }

  const result = schema.safeParse(json);
  if (!result.success) {
    return {
      data: null,
      error: NextResponse.json(
        {
          error: "Invalid request body",
          fieldErrors: z.flattenError(result.error).fieldErrors,
        },
        { status: 400 },
      ),
    };
  }

  return { data: result.data, error: null };
}
