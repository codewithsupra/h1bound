"use client";

import { useEffect, useRef, useState } from "react";
import type { SponsorBadge } from "@/lib/sponsor";
import { Stamp } from "@/components/chat/stamp";

const Me = ({ children }: { children: React.ReactNode }) => (
  <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-moon px-4 py-2.5 text-night">{children}</p>
);
const Maya = ({ children }: { children: React.ReactNode }) => <p className="max-w-[92%] leading-relaxed">{children}</p>;
const Card = ({ children }: { children: React.ReactNode }) => <div className="rounded-2xl border border-haze bg-night/60 p-4">{children}</div>;

function frames(company: string, badge: SponsorBadge, role: string, city: string): React.ReactNode[] {
  return [
    <>
      <div className="ml-auto flex w-fit items-center gap-3 rounded-2xl rounded-br-md bg-moon px-4 py-3 text-night">
        <span className="grid h-9 w-8 place-items-center rounded bg-red/80 text-[10px] font-bold text-white">PDF</span>
        <span className="leading-tight"><span className="block text-sm font-semibold">Aisha_CV.pdf</span><span className="text-xs opacity-70">2 pages</span></span>
      </div>
      <Maya>Got it. Python and SQL, MSc Business Analytics, a placement year in fintech. Which visa are you on in the UK right now?</Maya>
      <Me>Student visa, Graduate visa from January. {city} or remote.</Me>
    </>,
    <>
      <Maya>You can start on the Graduate visa anywhere, but licensed sponsors can keep you after it ends. Strongest match:</Maya>
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-display font-semibold">{role}</p>
            <p className="text-sm text-mist">{company} · {city}</p>
          </div>
          <Stamp badge={badge} />
        </div>
        <p className="mt-3 text-sm text-mist">{badge.detail}.</p>
      </Card>
    </>,
    <>
      <Me>Can you check my CV for that one?</Me>
      <Card>
        <p className="font-display font-semibold">Three changes for this role</p>
        <ul className="mt-2 space-y-1.5 text-sm text-moon/90">
          <li>Lead with the placement-year dashboard; it matches their stack.</li>
          <li>Put a number on the churn model (how many customers did it flag?).</li>
          <li>Cut the module list to three; recruiters skim the top third.</li>
        </ul>
      </Card>
    </>,
    <>
      <Maya>The team lead looks like the right person. Draft below; edit anything, then send it from your own Gmail.</Maya>
      <Card>
        <p className="text-xs text-mist">To: Sam R., Analytics Lead · 92% confidence</p>
        <p className="mt-2 text-sm leading-relaxed text-moon/90">Hi Sam, in my placement I built the churn model our retention team still uses; it flagged 1,200 at-risk accounts in its first month. Your graduate analyst role reads like that work. Open to a 15-minute chat next week?</p>
        <p className="mt-3 w-fit rounded-full bg-moon px-3 py-1 text-xs font-medium text-night">Send from my Gmail</p>
      </Card>
    </>,
    <>
      <div className="w-fit rounded-full border border-haze px-3 py-1 text-xs text-mist">Telegram · 08:00</div>
      <Maya>Morning Aisha! 3 new picks, all posted in the last 2 days at licensed sponsors. Tap one to see what it&apos;s like to work there.</Maya>
    </>,
  ];
}

const STEPS = [
  { title: "Drop in your CV.", body: "CV, resume or transcript. Maya reads it once, asks one question at a time and keeps an encrypted profile. The file is never stored." },
  { title: "See who can actually sponsor you.", body: "Jobs in the UK, the Netherlands and Ireland, plus remote roles open to you, checked against the official sponsor registers. Jobs you can't legally take never show up." },
  { title: "Fix your CV for each job.", body: "Specific changes for the posting in front of you, using only your real experience. Free on 5 jobs." },
  { title: "Reach the person who decides.", body: "Pro finds the hiring manager, or a founder at a startup, and drafts a short email. You check it and send it from your own Gmail in one tap, or not at all." },
  { title: "Wake up to fresh picks.", body: "Every morning, your best new matches on Telegram or email, with what it's like to work there one tap away." },
];

/**
 * How it works, Apple-style: the chat stays pinned while the steps scroll past and swap its
 * frame. Under lg each step carries its own frame, so nothing is pinned on phones.
 */
export function Story({ company, badge, role, city }: { company: string; badge: SponsorBadge; role: string; city: string }) {
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLLIElement | null)[]>([]);
  const all = frames(company, badge, role, city);

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && setActive(Number((e.target as HTMLElement).dataset.i))),
      { rootMargin: "-45% 0px -45% 0px" },
    );
    refs.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <section id="how" aria-labelledby="how-h" className="relative mx-auto max-w-6xl scroll-mt-16 px-4 py-24 sm:px-6">
      <h2 id="how-h" className="max-w-[16ch] font-display text-[clamp(2.2rem,5.5vw,4.5rem)] font-semibold leading-[1] tracking-[-0.035em]">
        From CV to the right inbox in one chat.
      </h2>
      <div className="mt-16 grid gap-12 lg:grid-cols-[1fr_1.1fr] lg:gap-20">
        <ol className="space-y-16 lg:space-y-0">
          {STEPS.map((s, i) => (
            <li
              key={s.title}
              ref={(el) => { refs.current[i] = el; }}
              data-i={i}
              className={`flex flex-col justify-center transition-opacity duration-500 lg:min-h-[72vh] ${active === i ? "lg:opacity-100" : "lg:opacity-35"}`}
            >
              <span className="font-flap text-sm text-sodium">Step {i + 1} of {STEPS.length}</span>
              <h3 className="mt-3 font-display text-[clamp(1.6rem,3vw,2.4rem)] font-semibold leading-tight tracking-[-0.02em]">{s.title}</h3>
              <p className="mt-3 max-w-[30rem] text-lg leading-relaxed text-mist">{s.body}</p>
              <div className="glass mt-6 space-y-3 rounded-3xl p-5 lg:hidden">{all[i]}</div>
            </li>
          ))}
        </ol>
        <div className="hidden lg:block">
          <div className="sticky top-[14vh] h-[72vh]">
            <div className="glass relative flex h-full flex-col overflow-hidden rounded-[2rem] shadow-[0_40px_120px_-40px_rgb(255_181_71_/_0.25)]">
              <div className="flex items-center gap-3 border-b border-haze px-5 py-4">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-sodium font-display font-bold text-night">M</span>
                <p className="font-display font-semibold">Maya <span className="ml-1 rounded border border-haze px-1 text-[0.65rem] text-mist">AI</span></p>
                <div className="ml-auto flex gap-1.5" aria-hidden>
                  {STEPS.map((_, i) => <span key={i} className={`h-1.5 rounded-full transition-all duration-500 ${i === active ? "w-6 bg-sodium" : "w-1.5 bg-haze"}`} />)}
                </div>
              </div>
              <div className="relative flex-1">
                {all.map((f, i) => (
                  <div
                    key={i}
                    aria-hidden={i !== active}
                    className={`absolute inset-0 flex flex-col justify-end space-y-3 p-6 transition-all duration-500 motion-reduce:transition-none ${i === active ? "translate-y-0 opacity-100" : i < active ? "-translate-y-6 opacity-0" : "translate-y-6 opacity-0"}`}
                  >
                    {f}
                  </div>
                ))}
              </div>
              <p className="border-t border-haze px-5 py-3 text-xs text-mist">Example conversation. The company, job and register entry are real.</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
