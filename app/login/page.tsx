import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { RedirectIfAuthed } from "@/lib/auth/redirect-if-authed";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Log in",
};

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-6">
      {/* Already logged in → redirect. Suspense keeps the form prerenderable. */}
      <Suspense>
        <RedirectIfAuthed />
      </Suspense>
      <h1 className="text-2xl font-bold">Log in</h1>
      <LoginForm />
      <p className="text-sm">
        No account?{" "}
        <Link href="/signup" className="underline">
          Sign up
        </Link>
      </p>
    </main>
  );
}
