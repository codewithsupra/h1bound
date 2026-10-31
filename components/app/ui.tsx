"use client";

import { useState, useTransition } from "react";

export const input = "h-10 w-full rounded-xl border border-haze bg-night/60 px-3 text-sm outline-none transition-colors focus:border-moon/40";

/** A workspace card: title, optional one-line purpose, and an Edit/Save toggle when `edit` is given. */
export function Card({ id, title, sub, children, edit, onSave, className = "" }: {
  id?: string; title: string; sub?: string; children: React.ReactNode | ((editing: boolean) => React.ReactNode);
  edit?: boolean; onSave?: () => Promise<{ ok: boolean; error?: string }>; className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <section id={id} className={`scroll-mt-6 rounded-3xl border border-haze bg-night-2/40 p-5 sm:p-6 ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold">{title}</h2>
          {sub && <p className="mt-0.5 text-sm text-mist">{sub}</p>}
        </div>
        {edit && (editing ? (
          <div className="flex gap-1.5">
            <button onClick={() => { setEditing(false); setError(null); }} className="rounded-full px-3 py-1.5 text-sm text-mist hover:text-moon">Cancel</button>
            <button disabled={pending} onClick={() => start(async () => { const r = await onSave!(); if (r.ok) { setEditing(false); setError(null); } else setError(r.error ?? "Couldn't save. Try again."); })} className="btn-light !px-4 !py-1.5 text-sm">{pending ? "Saving…" : "Save"}</button>
          </div>
        ) : (
          <button onClick={() => setEditing(true)} className="btn-ghost !px-3.5 !py-1.5 text-sm">Edit</button>
        ))}
      </div>
      {error && <p className="mt-3 text-sm text-red" role="alert">{error}</p>}
      <div className="mt-4">{typeof children === "function" ? children(editing) : children}</div>
    </section>
  );
}

/** One label/value line inside a card. */
export function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 border-t border-haze py-3 first:border-t-0 first:pt-0 sm:grid-cols-[11rem_1fr] sm:items-center sm:gap-4">
      <span className="text-sm text-mist">{label}</span>
      <div className="min-w-0 text-sm">{children}</div>
    </div>
  );
}

export function Chip({ on, onClick, children }: { on: boolean; onClick?: () => void; children: React.ReactNode }) {
  const cls = `rounded-full border px-3 py-1 text-sm transition-colors ${on ? "border-sodium/60 bg-sodium/10 text-moon" : "border-haze text-mist"}`;
  return onClick ? <button type="button" aria-pressed={on} onClick={onClick} className={`${cls} hover:border-moon/30`}>{children}</button> : <span className={cls}>{children}</span>;
}
