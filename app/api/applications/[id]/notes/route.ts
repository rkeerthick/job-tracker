import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { applications, notes } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { parseId } from "@/lib/parse-id";
import { parseBody } from "@/lib/parse-body";
import { createNoteSchema } from "@/lib/validations/note";

type Ctx = { params: Promise<{ id: string }> };

const badId = () => NextResponse.json({ error: "Invalid id" }, { status: 400 });
// Same 404 for "doesn't exist" and "not yours" — never 403.
const notFound = () => NextResponse.json({ error: "Not found" }, { status: 404 });

// notes has no userId, so ownership is checked through the parent application.
async function ownsApplication(applicationId: number, userId: number): Promise<boolean> {
  const [row] = await db
    .select({ id: applications.id })
    .from(applications)
    .where(and(eq(applications.id, applicationId), eq(applications.userId, userId)))
    .limit(1);
  return !!row;
}

export async function GET(_req: Request, { params }: Ctx) {
  const { user, error: authError } = await requireUser();
  if (authError) return authError;

  const applicationId = parseId((await params).id);
  if (applicationId === null) return badId();
  if (!(await ownsApplication(applicationId, user.id))) return notFound();

  const rows = await db
    .select()
    .from(notes)
    .where(eq(notes.applicationId, applicationId))
    .orderBy(desc(notes.createdAt), desc(notes.id));

  return NextResponse.json(rows);
}

export async function POST(req: Request, { params }: Ctx) {
  const { user, error: authError } = await requireUser();
  if (authError) return authError;

  const applicationId = parseId((await params).id);
  if (applicationId === null) return badId();

  // Ownership first, so a non-owner gets 404 whether or not the body is valid.
  if (!(await ownsApplication(applicationId, user.id))) return notFound();

  const { data, error: bodyError } = await parseBody(req, createNoteSchema);
  if (bodyError) return bodyError;

  const [created] = await db
    .insert(notes)
    .values({ applicationId, body: data.body })
    .returning();

  return NextResponse.json(created, { status: 201 });
}
