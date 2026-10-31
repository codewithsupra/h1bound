"use client";

import { useEffect, useMemo, useOptimistic, useRef, useState, useTransition } from "react";
import { setStage } from "@/app/(app)/actions";
import {
  GROUP_LABEL, GROUPS, STAGE_STATUS, TAB_LABEL, TABS, groupOf, groupRows, inTab, replyStats, tabCounts, visaUrgency, MIN_SENT_FOR_STATS,
  type PipelineRow, type Stage, type Tab,
} from "@/lib/pipeline";
import { useMaya } from "./maya-context";
import { PipelineTable } from "./pipeline-table";
import { PipelineBoard } from "./pipeline-board";
import { JobDrawer } from "./job-drawer";

type View = "table" | "board";
const VIEW_KEY = "sb.pipeline.view";

export function Pipeline({ rows: serverRows, now, visaEndsOn, gmail, pro, firstName }: { rows: PipelineRow[]; now: number; visaEndsOn: string | null; gmail: boolean; pro: boolean; firstName: string | null }) {
  const maya = useMaya();
  const [rows, moveOptimistic] = useOptimistic(serverRows, (state, m: { jobId: string; stage: Stage }) =>
    state.map((r) => (r.jobId === m.jobId ? { ...r, status: STAGE_STATUS[m.stage], statusAt: new Date().toISOString() } : r)));
  const [, start] = useTransition();
  const [tab, setTab] = useState<Tab>("all");
  const [view, setView] = useState<View>("table");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const search = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try { const v = localStorage.getItem(VIEW_KEY); if (v === "board" || v === "table") setTimeout(() => setView(v), 0); } catch { /* private mode */ }
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === "/" && !/input|textarea|select/i.test(t.tagName) && !t.isContentEditable) { e.preventDefault(); search.current?.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const pickView = (v: View) => { setView(v); try { localStorage.setItem(VIEW_KEY, v); } catch { /* private mode */ } };

  const urgency = visaUrgency(visaEndsOn, now);
  const urgent = urgency?.level === "urgent";
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle ? rows.filter((r) => `${r.company} ${r.title} ${r.location} ${r.contact?.name ?? ""}`.toLowerCase().includes(needle)) : rows;
  }, [rows, q]);
  const counts = useMemo(() => tabCounts(rows, now), [rows, now]);
  const groups = useMemo(() => groupRows(filtered.filter((r) => inTab(groupOf(r, now), tab)), now, urgent), [filtered, tab, now, urgent]);
  const stats = useMemo(() => replyStats(rows), [rows]);
  const move = (jobId: string, stage: Stage) => start(async () => { moveOptimistic({ jobId, stage }); await setStage(jobId, stage); });
  const current = rows.find((r) => r.jobId === selected) ?? null;

  return (
    <div className="mx-auto max-w-[78rem] px-4 py-6 sm:px-8 sm:py-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">Pipeline</h1>
          <p className="mt-1 text-sm text-mist">
            {counts.needs_you ? <><span className="text-sodium">{counts.needs_you} need{counts.needs_you === 1 ? "s" : ""} you</span> · </> : null}
            {counts.all} open {counts.all === 1 ? "job" : "jobs"}{urgent ? " · sponsors first while your visa clock is under 90 days" : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => maya.ask("Is this company a licensed sponsor, and are they hiring? ")} className="btn-ghost !px-4 !py-2 text-sm">Check a company</button>
          <button onClick={() => maya.ask("Find me today's best new jobs for my profile.")} className="btn-light !px-4 !py-2 text-sm">Find new jobs</button>
        </div>
      </header>

      {rows.length === 0 ? (
        <section className="mt-10 rounded-3xl border border-dashed border-haze p-8 text-center sm:p-12">
          <p className="font-display text-xl font-semibold">Your board is empty{firstName ? `, ${firstName}` : ""}.</p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-mist">Give Maya your CV and she&apos;ll fill it with jobs at employers on the official UK, Dutch and Irish sponsor registers, plus remote roles open to you.</p>
          <button onClick={() => maya.ask("Here's my CV, find me jobs that fit.")} className="btn-light mt-5 !px-5 !py-2.5 text-sm">Start with Maya</button>
        </section>
      ) : (
        <>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-b border-haze">
            <div className="-mb-px flex gap-1 overflow-x-auto" role="tablist">
              {TABS.map((t) => (
                <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
                  className={`whitespace-nowrap border-b-2 px-3 pb-2.5 pt-1 text-sm transition-colors ${tab === t ? "border-sodium text-moon" : "border-transparent text-mist hover:text-moon"}`}>
                  {TAB_LABEL[t]} <span className={t === "needs_you" && counts.needs_you ? "text-sodium" : "text-mist"}>{counts[t]}</span>
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 pb-2">
              <label className="relative">
                <span className="sr-only">Search the pipeline</span>
                <input ref={search} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className="h-8 w-40 rounded-full border border-haze bg-night-2/60 pl-3 pr-7 text-sm outline-none focus:border-moon/30 sm:w-52" />
                <kbd className="pointer-events-none absolute right-2 top-1.5 rounded border border-haze px-1 text-[10px] text-mist">/</kbd>
              </label>
              <div className="flex rounded-full border border-haze p-0.5 text-xs" role="group" aria-label="View">
                {(["table", "board"] as const).map((v) => (
                  <button key={v} onClick={() => pickView(v)} aria-pressed={view === v} className={`rounded-full px-3 py-1 capitalize ${view === v ? "bg-moon/10 text-moon" : "text-mist"}`}>{v}</button>
                ))}
              </div>
            </div>
          </div>

          {view === "table"
            ? <PipelineTable groups={groups} order={GROUPS} labels={GROUP_LABEL} now={now} urgent={urgent} onOpen={setSelected} />
            : <PipelineBoard rows={tab === "all" ? filtered : filtered.filter((r) => inTab(groupOf(r, now), tab))} onMove={move} onOpen={setSelected} />}

          <section className="mt-8 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center rounded-2xl border border-haze p-4">
            {stats.show ? (
              <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
                <p><span className="font-display text-2xl font-bold">{stats.sent}</span> <span className="text-mist">emails sent</span></p>
                <p><span className="font-display text-2xl font-bold">{stats.replied}</span> <span className="text-mist">replies</span></p>
                <p><span className="font-display text-2xl font-bold">{stats.interviews}</span> <span className="text-mist">interviews</span></p>
                <p><span className="font-display text-2xl font-bold text-sodium">{stats.rate}%</span> <span className="text-mist">your reply rate</span></p>
              </div>
            ) : (
              <p className="text-sm text-mist">Your own reply rate shows here once you&apos;ve emailed {MIN_SENT_FOR_STATS} people ({stats.sent} so far). It&apos;s counted only from what you send and mark, never estimated.</p>
            )}
            {!gmail && <a href="/api/gmail/connect" className="btn-ghost !px-4 !py-2 text-sm">Connect Gmail to track sends</a>}
          </section>
        </>
      )}

      {current && <JobDrawer key={current.jobId} row={current} now={now} gmail={gmail} pro={pro} urgent={urgent} onClose={() => setSelected(null)} onMove={move} />}
    </div>
  );
}
