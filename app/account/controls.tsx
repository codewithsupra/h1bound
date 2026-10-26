"use client";

import { useActionState, useTransition } from "react";
import { deleteAccount, setEmailUpdates, type DeleteState } from "@/app/actions/account";

export function AccountControls({ emailUpdates }: { emailUpdates: boolean }) {
  const [pending, start] = useTransition();
  const [state, action, deleting] = useActionState<DeleteState, FormData>(deleteAccount, { error: null });
  return (
    <>
      <section className="mt-4 rounded-xl border border-line bg-card p-5">
        <h2 className="font-display text-lg font-semibold">Updates from Maya</h2>
        <label className="mt-3 flex items-start gap-3">
          <input type="checkbox" defaultChecked={emailUpdates} disabled={pending} onChange={(e) => start(() => setEmailUpdates(e.target.checked))} className="mt-1 h-4 w-4" />
          <span>Email me new sponsor jobs that match me and reminders to follow up on applications. At most 3 a week, unsubscribe anytime.</span>
        </label>
      </section>

      <section className="mt-4 rounded-xl border border-red/40 bg-card p-5">
        <h2 className="font-display text-lg font-semibold">Delete all my data</h2>
        <p className="mt-1 text-sm text-slate">Erases your account, resume, chats and matches. This can&apos;t be undone.</p>
        <form action={action} className="mt-3 flex flex-wrap gap-2">
          <label htmlFor="confirm" className="sr-only">Type DELETE to confirm</label>
          <input id="confirm" name="confirm" placeholder="Type DELETE" autoComplete="off" className="h-10 rounded-lg border border-line bg-paper px-3" />
          <button disabled={deleting} className="h-10 rounded-lg bg-red px-3 font-medium text-white disabled:opacity-50">{deleting ? "Deleting…" : "Delete everything"}</button>
        </form>
        {state.error && <p className="mt-2 text-sm text-red" role="alert">{state.error}</p>}
      </section>
    </>
  );
}
