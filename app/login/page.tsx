import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AuthCard } from "@/components/AuthCard";
import { RedirectIfAuthed } from "@/lib/auth/redirect-if-authed";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Log in",
};

export default function LoginPage() {
  return (
    <AuthCard
      title="Log in"
      footer={
        <>
          No account?{" "}
          <Link href="/signup" className="text-accent-text hover:underline">
            Sign up
          </Link>
        </>
      }
    >
      {/* Already logged in → redirect. Suspense keeps the form prerenderable. */}
      <Suspense>
        <RedirectIfAuthed />
      </Suspense>
      <LoginForm />
    </AuthCard>
  );
}
