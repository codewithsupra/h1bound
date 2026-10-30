"use client";

import type { JobCard as Job } from "@/lib/server/jobs";
import { Stamp } from "./stamp";

function ago(iso: string | null) {
  if (!iso) return null;
  const d = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 86_400_000));
  return d === 0 ? "today" : d === 1 ? "yesterday" : d < 30 ? `${d} days ago` : null;
}

export function JobCard({ job, onAsk, index = 0 }: { job: Job; onAsk: (text: string) => void; index?: number }) {
  const posted = ago(job.postedAt);
  return (
    <article className="rise group rounded-2xl border border-haze bg-night-2/80 p-4 transition-colors hover:border-moon/20 sm:p-5" style={{ animationDelay: `${index * 110}ms` }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-[1.05rem] font-semibold leading-snug">{job.title}</h3>
          <p className="mt-0.5 text-sm text-mist">
            {job.company} <span aria-hidden>·</span> {job.remote ? "Remote" : job.location}
            {posted && <> <span aria-hidden>·</span> posted {posted}</>}
          </p>
        </div>
        <Stamp badge={job.badge} animate />
      </div>
      <p className="mt-3 text-sm text-mist">{job.badge.detail}</p>
      {job.why ? (
        <p className="mt-2 text-sm">Why it fits: {job.why.replace(/\.?$/, ".")}</p>
      ) : (
        job.reasons.length > 0 && <p className="mt-2 text-sm">Why it fits: {job.reasons.join(", ")}.</p>
      )}
      {job.gap && <p className="mt-1 text-sm text-mist">Gap to cover: {job.gap.replace(/\.?$/, ".")}</p>}
      {job.why && job.reasons.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Signals">
          {job.reasons.slice(0, 4).map((r) => <li key={r} className="rounded-full bg-haze/60 px-2.5 py-0.5 text-xs text-mist">{r}</li>)}
        </ul>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <a href={job.url} target="_blank" rel="noopener noreferrer" className="btn-light !px-4 !py-1.5 text-sm">Open posting</a>
        <button onClick={() => onAsk(`Review my resume for the ${job.title} role at ${job.company} (job ${job.id})`)} className="rounded-full border border-haze px-3.5 py-1.5 text-sm transition-colors hover:border-moon/30">
          Review my resume for this
        </button>
        <button onClick={() => onAsk(`Draft a cold email for the ${job.title} role at ${job.company} (job ${job.id})`)} className="rounded-full border border-haze px-3.5 py-1.5 text-sm transition-colors hover:border-moon/30">
          Cold email the hiring manager
        </button>
        <button onClick={() => onAsk(`What's it like to work at ${job.company}? Culture, reviews and interviews.`)} className="rounded-full border border-haze px-3.5 py-1.5 text-sm transition-colors hover:border-moon/30">
          About {job.company}
        </button>
      </div>
      {job.via && (
        <p className="mt-3 text-xs text-mist">
          Listed via <a href={job.via.url} target="_blank" rel="noopener" className="underline underline-offset-2">{job.via.name}</a>
        </p>
      )}
    </article>
  );
}
