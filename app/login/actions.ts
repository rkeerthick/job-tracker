"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";

export type LoginState = {
  error?: string;
  email?: string;
};

// Same message for unknown email and wrong password, so the form can't be
// used to find out which emails are registered.
const INVALID_CREDENTIALS = "Invalid email or password";

// When the email doesn't exist we still run bcrypt against this dummy hash,
// so both failure cases take about the same time (no timing leak).
let dummyHash: Promise<string> | undefined;
function getDummyHash() {
  dummyHash ??= hashPassword("dummy-password-for-timing");
  return dummyHash;
}

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: INVALID_CREDENTIALS, email };
  }

  const [user] = await db
    .select({ id: users.id, passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  const passwordOk = await verifyPassword(password, user?.passwordHash ?? (await getDummyHash()));

  if (!user || !passwordOk) {
    return { error: INVALID_CREDENTIALS, email };
  }

  await createSession(user.id);

  // redirect() throws internally, so keep it outside any try/catch.
  redirect("/applications");
}
