"use client";

import { useActionState } from "react";
import { joinWaitlistAction, type WaitlistState } from "@/app/actions/growth";

export function WaitlistForm() {
  const [state, action, pending] = useActionState<WaitlistState, FormData>(joinWaitlistAction, { ok: false, error: null });
  if (state.ok) return <p className="mt-5 text-green" role="status">You&apos;re on the list. We&apos;ll email you once when Maya is on WhatsApp, and that&apos;s it.</p>;
  return (
    <form action={action} className="mt-5 flex max-w-md flex-col gap-2 sm:flex-row">
      <label htmlFor="wl-email" className="sr-only">Email</label>
      <input id="wl-email" name="email" type="email" required placeholder="you@school.edu" className="h-11 min-w-0 flex-1 rounded-full border border-haze bg-night/60 px-4 text-moon outline-none placeholder:text-mist/70 focus:border-sodium/60" />
      <button disabled={pending} className="btn-ghost !py-2.5 disabled:opacity-60">{pending ? "Saving…" : "Tell me when"}</button>
      {state.error && <p className="text-sm text-red sm:basis-full" role="alert">{state.error}</p>}
    </form>
  );
}
