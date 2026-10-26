"use client";

import { useState } from "react";

export function CheckoutButton({ label }: { label: string }) {
  const [state, setState] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null });
  async function go() {
    setState({ busy: true, error: null });
    const res = await fetch("/api/billing/checkout", { method: "POST" });
    const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
    if (body.url) window.location.href = body.url;
    else setState({ busy: false, error: body.error ?? "Couldn't start checkout." });
  }
  return (
    <div className="mt-8">
      <button onClick={go} disabled={state.busy} className="h-12 w-full rounded-xl bg-ink font-medium text-paper disabled:opacity-50">
        {state.busy ? "Opening checkout…" : label}
      </button>
      {state.error && <p className="mt-2 text-sm text-red" role="alert">{state.error}</p>}
    </div>
  );
}
