import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AuthCard } from "@/components/AuthCard";
import { RedirectIfAuthed } from "@/lib/auth/redirect-if-authed";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = {
  title: "Sign up",
};

export default function SignupPage() {
  return (
    <AuthCard
      title="Create an account"
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="text-accent-text hover:underline">
            Log in
          </Link>
        </>
      }
    >
      {/* Already logged in → redirect. Suspense keeps the form prerenderable. */}
      <Suspense>
        <RedirectIfAuthed />
      </Suspense>
      <SignupForm />
    </AuthCard>
  );
}
