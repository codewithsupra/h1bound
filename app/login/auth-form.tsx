"use client";

import { useActionState, useState } from "react";
import { signIn, signInWithProvider, signUp, type AuthState } from "@/app/actions/auth";

const field = "h-11 w-full rounded-xl border border-line bg-card px-3.5 outline-none focus:border-ink";

export function AuthForm({ initialMode }: { initialMode: "signin" | "signup" }) {
  const [mode, setMode] = useState(initialMode);
  const [state, action, pending] = useActionState<AuthState, FormData>(mode === "signup" ? signUp : signIn, { error: null });
  return (
    <div className="mt-8">
      <h1 className="font-display text-3xl font-bold">{mode === "signup" ? "Meet Maya" : "Welcome back"}</h1>
      <p className="mt-1 text-slate">{mode === "signup" ? "Free: 10 matched jobs and resume reviews on 5 of them." : "Pick up where you left off."}</p>
      <form action={() => signInWithProvider("google")} className="mt-6">
        <button className="h-11 w-full rounded-xl border border-line bg-card font-medium hover:bg-paper">Continue with Google</button>
      </form>
      <form action={action} className="mt-4 space-y-3">
        {mode === "signup" && (
          <div>
            <label htmlFor="name" className="text-sm">First name</label>
            <input id="name" name="name" autoComplete="given-name" className={field} />
          </div>
        )}
        <div>
          <label htmlFor="email" className="text-sm">Email</label>
          <input id="email" name="email" type="email" required autoComplete="email" className={field} />
        </div>
        <div>
          <label htmlFor="password" className="text-sm">Password</label>
          <input id="password" name="password" type="password" required minLength={6} autoComplete={mode === "signup" ? "new-password" : "current-password"} className={field} />
        </div>
        {state.error && <p className="text-sm text-red" role="alert">{state.error}</p>}
        <button disabled={pending} className="h-11 w-full rounded-xl bg-ink font-medium text-paper disabled:opacity-50">
          {mode === "signup" ? (pending ? "Creating account…" : "Create account") : pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <p className="mt-5 text-sm text-slate">
        {mode === "signup" ? "Already have an account? " : "New here? "}
        <button onClick={() => setMode(mode === "signup" ? "signin" : "signup")} className="font-medium text-ink underline">
          {mode === "signup" ? "Sign in" : "Create an account"}
        </button>
      </p>
    </div>
  );
}
