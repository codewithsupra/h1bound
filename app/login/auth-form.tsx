"use client";

import { useActionState, useState } from "react";
import { signIn, signInWithProvider, signUp, type AuthState } from "@/app/actions/auth";

const field = "mt-1.5 h-12 w-full rounded-2xl border border-haze bg-night/60 px-4 text-moon outline-none transition-colors placeholder:text-mist/60 focus:border-sodium/60";

export function AuthForm({ initialMode }: { initialMode: "signin" | "signup" }) {
  const [mode, setMode] = useState(initialMode);
  const [state, action, pending] = useActionState<AuthState, FormData>(mode === "signup" ? signUp : signIn, { error: null });
  const signup = mode === "signup";
  return (
    <div>
      <h1 className="font-display text-3xl font-semibold tracking-tight">{signup ? "Create your account" : "Welcome back"}</h1>
      <p className="mt-2 text-mist">
        {signup ? "10 matched jobs and resume reviews on 5, free. If you were chatting with Maya, everything comes with you." : "Maya picks up where you left off."}
      </p>

      <form action={() => signInWithProvider("google")} className="mt-7">
        <button className="btn-ghost w-full !py-3">
          <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden><path fill="#fff" d="M21.35 11.1H12v2.98h5.35c-.23 1.4-1.66 4.1-5.35 4.1a5.95 5.95 0 0 1 0-11.9c1.85 0 3.1.79 3.8 1.47l2.6-2.5C16.85 3.7 14.65 2.7 12 2.7a9.3 9.3 0 1 0 0 18.6c5.37 0 8.93-3.77 8.93-9.09 0-.61-.07-1.08-.16-1.55Z" /></svg>
          Continue with Google
        </button>
      </form>

      <div className="my-6 flex items-center gap-3 text-xs text-mist"><span className="h-px flex-1 bg-haze" />or with email<span className="h-px flex-1 bg-haze" /></div>

      <form action={action} className="space-y-4">
        {signup && (
          <div>
            <label htmlFor="name" className="text-sm text-mist">First name</label>
            <input id="name" name="name" autoComplete="given-name" className={field} />
          </div>
        )}
        <div>
          <label htmlFor="email" className="text-sm text-mist">Email</label>
          <input id="email" name="email" type="email" required autoComplete="email" className={field} />
        </div>
        <div>
          <label htmlFor="password" className="text-sm text-mist">Password</label>
          <input id="password" name="password" type="password" required minLength={6} autoComplete={signup ? "new-password" : "current-password"} className={field} />
        </div>
        {state.error && <p className="text-sm text-red" role="alert">{state.error}</p>}
        <button disabled={pending} className="btn-light w-full !py-3 disabled:opacity-50">
          {signup ? (pending ? "Creating account…" : "Create account") : pending ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <p className="mt-6 text-sm text-mist">
        {signup ? "Already have an account? " : "New here? "}
        <button type="button" onClick={() => setMode(signup ? "signin" : "signup")} className="font-medium text-moon underline decoration-haze underline-offset-4 transition-colors hover:decoration-sodium">
          {signup ? "Sign in" : "Create an account"}
        </button>
      </p>
    </div>
  );
}
