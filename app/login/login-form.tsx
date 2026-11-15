"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { login, type LoginState } from "./actions";

const initialState: LoginState = {};

export function LoginForm() {
  const [state, formAction, pending] = useActionState(login, initialState);

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
        autoComplete="current-password"
      />

      {/* One generic message for any failure: don't reveal which part was wrong. */}
      {state.error && <Alert>{state.error}</Alert>}

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Logging in…" : "Log in"}
      </Button>
    </form>
  );
}
