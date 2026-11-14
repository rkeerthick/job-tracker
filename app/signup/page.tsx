import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = {
  title: "Sign up",
};

export default async function SignupPage() {
  // Already logged in — no need to sign up again.
  if (await getCurrentUser()) redirect("/");

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-6">
      <h1 className="text-2xl font-bold">Create an account</h1>
      <SignupForm />
      <p className="text-sm">
        Already have an account?{" "}
        <Link href="/login" className="underline">
          Log in
        </Link>
      </p>
    </main>
  );
}
