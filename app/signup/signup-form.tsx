"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { signup, type SignupState } from "./actions";

const initialState: SignupState = {};

export function SignupForm() {
  const [state, formAction, pending] = useActionState(signup, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Input
        label="Email"
        name="email"
        type="email"
        required
        autoComplete="email"
        defaultValue={state.email}
      />
      <Input
        label="Password"
        name="password"
        type="password"
        required
        minLength={8}
        autoComplete="new-password"
      />
      <p className="-mt-2 text-xs text-muted">At least 8 characters.</p>

      {state.error && <Alert>{state.error}</Alert>}

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Creating account…" : "Sign up"}
      </Button>
    </form>
  );
}
