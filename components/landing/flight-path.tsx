"use client";

import { useInView } from "./in-view";

const STOPS = [
  { title: "Drop in your resume", body: "Resume, CV, transcript or biodata. Maya reads it once; we keep an encrypted profile, never the file." },
  { title: "Get matched to sponsors", body: "Open US jobs, ranked for you, only at employers with H-1B filings. Postings that refuse sponsorship are filtered out." },
  { title: "Reach the person who decides", body: "Resume reviews per job, then (Pro) the hiring manager's name and a cold email that sounds like you." },
];

/** Three real steps, traced by a flight path that draws itself as you scroll in. */
export function FlightPath() {
  const [ref, seen] = useInView<HTMLDivElement>(0.3);
  return (
    <div ref={ref} className="relative">
      <svg viewBox="0 0 1000 120" className="pointer-events-none absolute inset-x-0 top-3 hidden h-24 w-full md:block" preserveAspectRatio="none" aria-hidden>
        <path
          d="M 60 70 C 260 -10, 360 -10, 500 60 S 760 140, 940 50"
          fill="none"
          stroke="var(--sodium)"
          strokeWidth="2"
          pathLength={1}
          style={{ strokeDasharray: "1", strokeDashoffset: seen ? 0 : 1, transition: "stroke-dashoffset 2.2s cubic-bezier(0.4, 0, 0.2, 1)", opacity: 0.55 }}
        />
      </svg>
      <ol className="relative grid gap-10 md:grid-cols-3 md:gap-8">
        {STOPS.map((s, i) => (
          <li key={s.title} className={seen ? "rise" : "opacity-0"} style={{ animationDelay: `${300 + i * 650}ms` }}>
            <span className="grid h-11 w-11 place-items-center rounded-full border border-sodium/50 bg-night font-flap text-sodium shadow-[0_0_30px_-4px_var(--sodium)]">
              {i + 1}
            </span>
            <h3 className="mt-5 font-display text-xl font-semibold">{s.title}</h3>
            <p className="mt-2 max-w-[22rem] leading-relaxed text-mist">{s.body}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
