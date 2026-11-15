import { NextResponse } from "next/server";
import { db } from "@/db";
import { applications } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { listApplications } from "@/lib/applications";
import { parseBody } from "@/lib/parse-body";
import { createApplicationSchema } from "@/lib/validation";

export async function GET() {
  const { user, error: authError } = await requireUser();
  if (authError) return authError;

  return NextResponse.json(await listApplications(user.id));
}

export async function POST(request: Request) {
  const { user, error: authError } = await requireUser();
  if (authError) return authError;

  const { data, error: bodyError } = await parseBody(request, createApplicationSchema);
  if (bodyError) return bodyError;

  // userId always comes from the session, never the body.
  // (Zod also strips unknown keys, so a "userId" in the body is dropped anyway.)
  const [created] = await db
    .insert(applications)
    .values({ ...data, userId: user.id })
    .returning();

  return NextResponse.json(created, { status: 201 });
}
