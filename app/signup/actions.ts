"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";

export type SignupState = {
  error?: string;
  email?: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;
const DUPLICATE_EMAIL_ERROR = "An account with this email already exists.";

// Postgres unique_violation. Drizzle wraps driver errors, so check `cause` too.
function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } } | null;
  return e?.code === "23505" || e?.cause?.code === "23505";
}

export async function signup(_prev: SignupState, formData: FormData): Promise<SignupState> {
  // Normalize so A@x.com and a@x.com can't become two accounts (Postgres unique is case-sensitive).
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!EMAIL_RE.test(email) || email.length > 255) {
    return { error: "Please enter a valid email address.", email };
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`, email };
  }

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (existing.length > 0) {
    return { error: DUPLICATE_EMAIL_ERROR, email };
  }

  let userId: number;
  try {
    const [user] = await db
      .insert(users)
      .values({ email, passwordHash: await hashPassword(password) })
      .returning({ id: users.id });
    userId = user.id;
  } catch (err) {
    // Two signups racing past the check above — the unique constraint catches it.
    if (isUniqueViolation(err)) return { error: DUPLICATE_EMAIL_ERROR, email };
    throw err;
  }

  await createSession(userId);

  // redirect() throws internally, so keep it outside try/catch.
  redirect("/");
}
