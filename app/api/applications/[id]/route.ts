import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { applications } from "@/db/schema";
import { internalError } from "@/lib/api-error";
import { requireUser } from "@/lib/auth";
import { parseId } from "@/lib/parse-id";
import { parseBody } from "@/lib/parse-body";
import { updateApplicationSchema } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

const badId = () => NextResponse.json({ error: "Invalid id" }, { status: 400 });

// Same response for "doesn't exist" and "belongs to someone else" — never 403,
// so ids can't be probed to learn which ones exist.
const notFound = () => NextResponse.json({ error: "Not found" }, { status: 404 });

// Both conditions in every query: id AND owner.
const owned = (id: number, userId: number) =>
  and(eq(applications.id, id), eq(applications.userId, userId));

export async function GET(_req: Request, { params }: Ctx) {
  const route = "GET /api/applications/[id]";
  let userId: number | undefined;
  try {
    const { user, error: authError } = await requireUser();
    if (authError) return authError;
    userId = user.id;

    const id = parseId((await params).id);
    if (id === null) return badId();

    const [row] = await db.select().from(applications).where(owned(id, user.id)).limit(1);
    if (!row) return notFound();

    return NextResponse.json(row);
  } catch (err) {
    return internalError("get application failed", { route, userId }, err);
  }
}

export async function PATCH(req: Request, { params }: Ctx) {
  const route = "PATCH /api/applications/[id]";
  let userId: number | undefined;
  try {
    const { user, error: authError } = await requireUser();
    if (authError) return authError;
    userId = user.id;

    const id = parseId((await params).id);
    if (id === null) return badId();

    const { data, error: bodyError } = await parseBody(req, updateApplicationSchema);
    if (bodyError) return bodyError;

    const [updated] = await db
      .update(applications)
      .set(data)
      .where(owned(id, user.id))
      .returning();
    if (!updated) return notFound();

    return NextResponse.json(updated);
  } catch (err) {
    return internalError("update application failed", { route, userId }, err);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const route = "DELETE /api/applications/[id]";
  let userId: number | undefined;
  try {
    const { user, error: authError } = await requireUser();
    if (authError) return authError;
    userId = user.id;

    const id = parseId((await params).id);
    if (id === null) return badId();

    const [deleted] = await db
      .delete(applications)
      .where(owned(id, user.id))
      .returning({ id: applications.id });
    if (!deleted) return notFound();

    return NextResponse.json({ id: deleted.id });
  } catch (err) {
    return internalError("delete application failed", { route, userId }, err);
  }
}
