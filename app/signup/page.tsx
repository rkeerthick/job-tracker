import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { RedirectIfAuthed } from "@/lib/auth/redirect-if-authed";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = {
  title: "Sign up",
};

export default function SignupPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-6">
      {/* Already logged in → redirect. Suspense keeps the form prerenderable. */}
      <Suspense>
        <RedirectIfAuthed />
      </Suspense>
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
