"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { startTrialAction } from "@/app/actions/growth";

/** Starts the 7-day no-card Pro trial, then refreshes server data so Pro shows everywhere. */
export function TrialButton({ className = "btn-light !py-2 !px-4 text-sm", onStarted }: { className?: string; onStarted?: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col gap-1">
      <button
        type="button"
        disabled={pending || msg !== null}
        className={`${className} disabled:opacity-60`}
        onClick={() =>
          start(async () => {
            const r = await startTrialAction();
            if (r.ok) {
              setMsg(`Pro is on until ${new Date(r.endsAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}.`);
              onStarted?.();
              router.refresh();
            } else setMsg(r.error);
          })
        }
      >
        {pending ? "Starting…" : "Start 7-day free trial"}
      </button>
      {msg && <span className="text-xs text-mist" role="status">{msg}</span>}
    </span>
  );
}
