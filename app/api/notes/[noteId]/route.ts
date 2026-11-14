import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { applications, notes } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { parseId } from "@/lib/parse-id";

type Ctx = { params: Promise<{ noteId: string }> };

export async function DELETE(_req: Request, { params }: Ctx) {
  const { user, error: authError } = await requireUser();
  if (authError) return authError;

  const noteId = parseId((await params).noteId);
  if (noteId === null) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  // Note id AND application ownership in one query. Checking only the note id
  // would let any logged-in user delete anyone's note.
  const [owned] = await db
    .select({ id: notes.id })
    .from(notes)
    .innerJoin(applications, eq(notes.applicationId, applications.id))
    .where(and(eq(notes.id, noteId), eq(applications.userId, user.id)))
    .limit(1);

  // Missing or someone else's: same 404, never 403.
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.delete(notes).where(eq(notes.id, owned.id));

  return NextResponse.json({ id: owned.id });
}
