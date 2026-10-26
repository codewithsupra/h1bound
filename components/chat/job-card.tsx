"use client";

import type { JobCard as Job } from "@/lib/server/jobs";
import { Stamp } from "./stamp";

function ago(iso: string | null) {
  if (!iso) return null;
  const d = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 86_400_000));
  return d === 0 ? "today" : d === 1 ? "yesterday" : d < 30 ? `${d} days ago` : null;
}

export function JobCard({ job, onAsk }: { job: Job; onAsk: (text: string) => void }) {
  const posted = ago(job.postedAt);
  return (
    <article className="rounded-xl border border-line bg-card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-[1.05rem] font-semibold leading-snug">{job.title}</h3>
          <p className="mt-0.5 text-sm text-slate">
            {job.company} <span aria-hidden>·</span> {job.remote ? "Remote" : job.location}
            {posted && <> <span aria-hidden>·</span> posted {posted}</>}
          </p>
        </div>
        <Stamp badge={job.badge} animate />
      </div>
      <p className="mt-3 text-sm text-slate">{job.badge.detail}</p>
      {job.reasons.length > 0 && <p className="mt-2 text-sm">Why it fits: {job.reasons.join(", ")}.</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        <a href={job.url} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-ink px-3 py-1.5 text-sm font-medium text-paper hover:opacity-90">
          Open posting
        </a>
        <button onClick={() => onAsk(`Review my resume for the ${job.title} role at ${job.company} (job ${job.id})`)} className="rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-paper">
          Review my resume for this
        </button>
        <button onClick={() => onAsk(`Draft a cold email for the ${job.title} role at ${job.company} (job ${job.id})`)} className="rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-paper">
          Cold email the hiring manager
        </button>
      </div>
    </article>
  );
}
