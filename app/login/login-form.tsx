"use client";

import { useActionState } from "react";
import { login, type LoginState } from "./actions";

const initialState: LoginState = {};

export function LoginForm() {
  const [state, formAction, pending] = useActionState(login, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Email</span>
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          defaultValue={state.email}
          className="rounded border px-3 py-2"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Password</span>
        <input
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="rounded border px-3 py-2"
        />
      </label>

      {state.error && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded bg-black px-3 py-2 text-white disabled:opacity-50"
      >
        {pending ? "Logging in…" : "Log in"}
      </button>
    </form>
  );
}
