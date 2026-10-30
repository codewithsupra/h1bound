"use client";

import { useActionState, useTransition } from "react";
import { deleteAccount, setEmailUpdates, type DeleteState } from "@/app/actions/account";

export function AccountControls({ emailUpdates }: { emailUpdates: boolean }) {
  const [pending, start] = useTransition();
  const [state, action, deleting] = useActionState<DeleteState, FormData>(deleteAccount, { error: null });
  return (
    <>
      <section className="mt-4 glass rounded-3xl p-6">
        <h2 className="font-display text-lg font-semibold">Updates from Maya</h2>
        <label className="mt-3 flex items-start gap-3">
          <input type="checkbox" defaultChecked={emailUpdates} disabled={pending} onChange={(e) => start(() => setEmailUpdates(e.target.checked))} className="mt-1 h-4 w-4 accent-[var(--sodium)]" />
          <span>Email me my daily picks (the best new matches, with sponsor proof) and reminders to follow up. Unsubscribe anytime.</span>
        </label>
      </section>

      <section className="mt-4 glass rounded-3xl border-red/40 p-6">
        <h2 className="font-display text-lg font-semibold">Delete all my data</h2>
        <p className="mt-1 text-sm text-slate">Erases your account, resume, chats and matches. This can&apos;t be undone.</p>
        <form action={action} className="mt-3 flex flex-wrap gap-2">
          <label htmlFor="confirm" className="sr-only">Type DELETE to confirm</label>
          <input id="confirm" name="confirm" placeholder="Type DELETE" autoComplete="off" className="h-10 rounded-full border border-haze bg-night/60 px-4 outline-none focus:border-red/60" />
          <button disabled={deleting} className="h-10 rounded-full bg-red px-4 font-medium text-night disabled:opacity-50">{deleting ? "Deleting…" : "Delete everything"}</button>
        </form>
        {state.error && <p className="mt-2 text-sm text-red" role="alert">{state.error}</p>}
      </section>
    </>
  );
}
