import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Log in",
};

export default async function LoginPage() {
  // Already logged in — skip the form.
  if (await getCurrentUser()) redirect("/");

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-6">
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
