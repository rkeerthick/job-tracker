import { NextResponse } from "next/server";
import { internalError } from "@/lib/api-error";
import { requireUser } from "@/lib/auth";
import { extractWithRetry } from "@/lib/extract-job";
import { isUnreadable } from "@/lib/extraction";
import { callGroq } from "@/lib/groq";
import { log } from "@/lib/log";
import { parseBody } from "@/lib/parse-body";
import { extractRequestSchema } from "@/lib/validation";

// Two model calls (retry) at up to 12s each; the platform default can be shorter.
export const maxDuration = 30;

export async function POST(request: Request) {
  const route = "POST /api/extract";
  let userId: number | undefined;
  try {
    // First: logged-out callers must never reach the paid model call.
    const { user, error: authError } = await requireUser();
    if (authError) return authError;
    userId = user.id;

    const { data: body, error: bodyError } = await parseBody(request, extractRequestSchema);
    if (bodyError) return bodyError;
    const { text } = body;

    // Privacy: the posting text is never logged, only its length.
    let result;
    try {
      result = await extractWithRetry(text, callGroq);
    } catch (err) {
      // 429, timeout, missing key, network... The client only gets a generic message.
      log("error", "extraction provider call failed", { route, userId, textLength: text.length, error: err });
      return NextResponse.json({ error: "AI is busy, try again in a minute." }, { status: 503 });
    }

    if (!result.ok) {
      // Invalid after the retry. Not logged: result.rawOutput (derived from the post). `reason` is schema paths only.
      log("warn", "extraction output invalid after retry", {
        route, userId, textLength: text.length, attempts: result.attempts, reason: result.error,
      });
      return NextResponse.json({ error: "Couldn't read this posting. Fill the form manually." }, { status: 422 });
    }

    if (isUnreadable(result.data)) {
      // Valid JSON but no company and no role: the text isn't a job posting. Nothing to pre-fill.
      log("warn", "extraction found no company or role", { route, userId, textLength: text.length, attempts: result.attempts });
      return NextResponse.json({ error: "Couldn't read this posting. Fill the form manually." }, { status: 422 });
    }

    log("info", "extraction ok", { route, userId, textLength: text.length, attempts: result.attempts });
    return NextResponse.json({ data: result.data });
  } catch (err) {
    return internalError("extract failed", { route, userId }, err);
  }
}
