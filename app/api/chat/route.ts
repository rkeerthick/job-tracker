import { internalError } from "@/lib/api-error";
import { requireUser } from "@/lib/auth";
import { createChatStream, NDJSON_HEADERS } from "@/lib/chat-stream";
import { callGroqChatStream } from "@/lib/groq";
import { parseBody } from "@/lib/parse-body";
import { createChatTools } from "@/lib/tools";
import { chatRequestSchema } from "@/lib/validation";

// Up to 5 model calls (each with its own idle timeout) plus tool queries.
export const maxDuration = 60;

export async function POST(request: Request) {
  const route = "POST /api/chat";
  let userId: number | undefined;
  try {
    // 401 and 400 are normal JSON responses: they happen before the stream opens, so the status is still ours to set.
    const { user, error: authError } = await requireUser();
    if (authError) return authError;
    userId = user.id;

    const { data, error: bodyError } = await parseBody(request, chatRequestSchema);
    if (bodyError) return bodyError;

    const stream = createChatStream({
      userId: user.id,
      messages: data.messages,
      tools: createChatTools(user.id), // the tools are bound to the SESSION's user, never to anything in the body
      callModel: (messages, tools, onToken, signal) => callGroqChatStream(messages, tools, onToken ?? (() => {}), signal),
      signal: request.signal,
      route,
    });

    return new Response(stream, { headers: NDJSON_HEADERS });
  } catch (err) {
    return internalError("chat failed before streaming", { route, userId }, err);
  }
}
