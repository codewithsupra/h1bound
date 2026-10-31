"use client";

import { useState } from "react";
import { licenceFlap, licenceLine, MARKET_NAME, type Market } from "@/lib/visa";
import { canSponsor, nextAction, NEXT_LABEL, type Group, type NextAction, type PipelineRow } from "@/lib/pipeline";
import { MiniFlap } from "./mini-flap";

const NEXT_TONE: Record<NextAction, "sodium" | "green" | "mist" | "moon"> = {
  draft_ready: "sodium", follow_up: "sodium", ask_reply: "sodium", respond: "green", prep: "green", write: "moon", waiting: "mist", none: "mist",
};

export function where(r: Pick<PipelineRow, "remote" | "location" | "country">): string {
  if (r.remote) return "Remote";
  const city = r.location.split(/[,;]/)[0]?.trim();
  const country = r.country && r.country in MARKET_NAME ? MARKET_NAME[r.country as Market] : null;
  return [city, country && !r.location.includes(country) ? country : null].filter(Boolean).join(", ") || "—";
}

export function ago(iso: string, now: number): string {
  const m = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  if (m < 60) return m <= 1 ? "just now" : `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return d < 30 ? `${d}d ago` : new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function VisaProof({ row }: { row: PipelineRow }) {
  if (!row.licence) return <span className="text-xs text-mist">{row.remote ? "Remote role" : "Not on register"}</span>;
  const f = licenceFlap(row.licence);
  return <MiniFlap text={f.text} tone={f.tone} title={licenceLine(row.licence)} />;
}

export function Fit({ score }: { score: number }) {
  const lit = Math.max(1, Math.min(5, Math.round(score / 20)));
  return (
    <span className="inline-flex items-center gap-2" aria-label={`Fit ${score} out of 100`}>
      <span className="flex gap-[3px]" aria-hidden>
        {[0, 1, 2, 3, 4].map((i) => <span key={i} className={`h-1 w-3 rounded-full ${i < lit ? (score >= 80 ? "bg-green" : "bg-sodium") : "bg-haze"}`} />)}
      </span>
      <span className="text-sm">{score}</span>
    </span>
  );
}

const COLS = "md:grid md:grid-cols-[minmax(0,2.4fr)_minmax(0,1.1fr)_8.5rem_minmax(0,1.3fr)_6.5rem_8.5rem_5rem] md:items-center md:gap-4";

/** The board as a table, grouped by what each job needs next. Closed jobs only appear on their own tab. */
export function PipelineTable({ groups, order, labels, now, urgent, onOpen }: {
  groups: Record<Group, PipelineRow[]>; order: Group[]; labels: Record<Group, string>; now: number; urgent: boolean; onOpen: (jobId: string) => void;
}) {
  const [collapsed, setCollapsed] = useState<Partial<Record<Group, boolean>>>({});
  const shown = order.filter((g) => groups[g].length);
  if (!shown.length) return <p className="py-12 text-center text-sm text-mist">Nothing here.</p>;

  return (
    <div className="mt-4">
      <div className={`hidden px-3 pb-2 text-xs text-mist ${COLS}`}>
        <span>Company and role</span><span>Where</span><span>Register</span><span>Contact</span><span>Fit</span><span>Next</span><span className="text-right">Updated</span>
      </div>
      {shown.map((g) => (
        <section key={g} className="mt-3">
          <button onClick={() => setCollapsed((c) => ({ ...c, [g]: !c[g] }))} aria-expanded={!collapsed[g]} className="flex items-center gap-2 px-1 py-1.5 text-sm">
            <span aria-hidden className={`text-mist transition-transform ${collapsed[g] ? "-rotate-90" : ""}`}>▾</span>
            <span className={g === "needs_you" ? "font-semibold text-sodium" : "font-semibold"}>{labels[g]}</span>
            <span className="text-mist">{groups[g].length}</span>
          </button>
          {!collapsed[g] && (
            <ul className="divide-y divide-haze overflow-hidden rounded-2xl border border-haze bg-night-2/30">
              {groups[g].map((r) => {
                const next = nextAction(r, now);
                const longShot = urgent && !r.remote && !canSponsor(r.licence);
                return (
                  <li key={r.jobId}>
                    <button onClick={() => onOpen(r.jobId)} className={`w-full px-3 py-3 text-left transition-colors hover:bg-moon/[0.04] focus-visible:bg-moon/[0.04] ${COLS} ${longShot ? "opacity-60" : ""}`}>
                      <span className="block min-w-0">
                        <span className="font-semibold">{r.company}</span>
                        <span className="ml-2 text-sm text-mist">{r.title}</span>
                        {longShot && <span className="block text-xs text-mist">Can&apos;t sponsor after your visa ends</span>}
                        {r.hasNote && <span className="ml-2 text-xs text-runway" title="Has a note">•</span>}
                      </span>
                      <span className="mt-1 block truncate text-sm text-mist md:mt-0">{where(r)}</span>
                      <span className="mt-2 flex items-center gap-3 md:contents">
                        <span className="block"><VisaProof row={r} /></span>
                        <span className="block min-w-0 truncate text-sm">
                          {r.contact?.name ? <>{r.contact.name}{r.contact.role && <span className="text-mist"> · {r.contact.role}</span>}</> : <span className="text-mist">{r.draft ? "Find on LinkedIn" : "—"}</span>}
                        </span>
                      </span>
                      <span className="mt-2 flex items-center justify-between gap-3 md:contents">
                        <span className="block"><Fit score={r.score} /></span>
                        <span className="block"><MiniFlap text={NEXT_LABEL[next]} tone={NEXT_TONE[next]} /></span>
                        <span className="block text-right text-xs text-mist">{ago(r.statusAt, now)}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
