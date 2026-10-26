"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { SponsorBadge } from "@/lib/sponsor";
import { Stamp } from "@/components/chat/stamp";

type Result = { name: string; slug: string | null; legalName: string; states: string[]; badge: SponsorBadge };

const ROLES = ["Software engineer", "Data scientist", "Data analyst", "ML engineer", "Product manager", "Hardware engineer"];

export function SponsorLookup() {
  const [q, setQ] = useState("");
  const [role, setRole] = useState(ROLES[0]);
  const [results, setResults] = useState<Result[] | null>(null);

  useEffect(() => {
    if (q.trim().length < 2) return;
    const t = setTimeout(() => {
      fetch(`/api/sponsors/search?q=${encodeURIComponent(q)}&role=${encodeURIComponent(role)}`)
        .then((r) => r.json())
        .then((b: { results: Result[] }) => setResults(b.results))
        .catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q, role]);

  const shown = q.trim().length < 2 ? null : results;

  return (
    <div className="rounded-2xl border border-line bg-card p-5 sm:p-7">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <div>
          <label htmlFor="co" className="text-sm text-slate">Company</label>
          <input id="co" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Try Stripe, Databricks, Tesla…" className="mt-1 h-12 w-full rounded-xl border border-line bg-paper px-4 text-lg outline-none focus:border-ink" />
        </div>
        <div>
          <label htmlFor="role" className="text-sm text-slate">Role</label>
          <select id="role" value={role} onChange={(e) => setRole(e.target.value)} className="mt-1 h-12 w-full rounded-xl border border-line bg-paper px-3 outline-none focus:border-ink">
            {ROLES.map((r) => <option key={r}>{r}</option>)}
          </select>
        </div>
      </div>
      <div className="mt-5 min-h-24 space-y-3">
        {shown === null && <p className="text-slate">Type a company to see its H-1B filings for fiscal year 2026.</p>}
        {shown?.length === 0 && <p className="text-slate">No H-1B labor filings found under that name in FY2026. That usually means they don&apos;t sponsor, or file under a different legal name.</p>}
        {shown?.map((r) => (
          <div key={r.legalName} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-3 first:border-t-0 first:pt-0">
            <Stamp badge={r.badge} />
            <div className="min-w-0 flex-1">
              <p className="font-display font-semibold">{r.slug ? <Link href={`/sponsors/${r.slug}`} className="underline decoration-line underline-offset-4 hover:decoration-ink">{r.name}</Link> : r.name}</p>
              <p className="text-sm text-slate">{r.badge.detail.replace(" Source: US Dept. of Labor LCA data.", "")}{r.states.length ? ` Mostly in ${r.states.slice(0, 3).join(", ")}.` : ""}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
