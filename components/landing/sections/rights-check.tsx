"use client";

import { useState } from "react";
import { MARKET_NAME, MARKETS, workRights, type Market, type VisaSituation, type WorkRight } from "@/lib/visa";
import { openMaya } from "../try-maya";

const PASSPORTS: [string, string][] = [
  ["IN", "India"], ["NG", "Nigeria"], ["PK", "Pakistan"], ["CN", "China"], ["BD", "Bangladesh"], ["GH", "Ghana"], ["KE", "Kenya"],
  ["NP", "Nepal"], ["LK", "Sri Lanka"], ["VN", "Vietnam"], ["PH", "Philippines"], ["ID", "Indonesia"], ["MY", "Malaysia"], ["TR", "Turkey"],
  ["EG", "Egypt"], ["BR", "Brazil"], ["MX", "Mexico"], ["US", "United States"], ["CA", "Canada"], ["AU", "Australia"],
  ["DE", "Germany"], ["FR", "France"], ["IT", "Italy"], ["ES", "Spain"], ["PL", "Poland"], ["RO", "Romania"], ["PT", "Portugal"],
  ["GR", "Greece"], ["NL", "Netherlands"], ["IE", "Ireland"], ["GB", "United Kingdom"], ["ZZ", "Another country (outside the EU)"],
];

const SITUATIONS: [string, string][] = [
  ["none", "No visa in the UK, NL or Ireland yet"],
  ["student", "Studying there on a student visa"],
  ["graduate", "On a post-study visa (UK Graduate, Stamp 1G, orientation year)"],
  ["sponsored", "On a sponsored work visa"],
];

const VERDICT: Record<WorkRight, { label: string; detail: string; tone: string }> = {
  free: { label: "Free to work", detail: "No sponsor needed. Every job is open to you.", tone: "border-green/40 text-green" },
  post_study: { label: "Post-study visa", detail: "You can work now; a licensed sponsor keeps you after it ends.", tone: "border-sodium/40 text-sodium" },
  sponsor: { label: "Needs a sponsor", detail: "Only licensed employers can hire you. We show only those.", tone: "border-haze text-moon" },
};

/** "Where can I work?" in two taps. Same rules Maya uses (lib/visa.ts); runs in the browser, nothing is sent. */
export function RightsCheck() {
  const [passport, setPassport] = useState("IN");
  const [situation, setSituation] = useState<VisaSituation>("none");
  const [visaCountry, setVisaCountry] = useState<Market>("GB");
  const hasVisa = situation !== "none";
  const rights = workRights({ citizenship: passport === "ZZ" ? null : passport, visaCountry: hasVisa ? visaCountry : null, visaSituation: situation });
  const passportName = PASSPORTS.find(([c]) => c === passport)?.[1] ?? "my";
  const select = "h-12 w-full rounded-full border border-haze bg-night/60 px-4 text-moon outline-none focus:border-sodium/60";

  return (
    <div className="glass rounded-[2rem] p-5 sm:p-8">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1.5 text-sm text-mist">
          Your passport
          <select value={passport} onChange={(e) => setPassport(e.target.value)} className={select}>
            {PASSPORTS.map(([c, n]) => <option key={c} value={c}>{n}</option>)}
          </select>
        </label>
        <label className="space-y-1.5 text-sm text-mist">
          Right now you&apos;re
          <select value={situation} onChange={(e) => setSituation(e.target.value as VisaSituation)} className={select}>
            {SITUATIONS.map(([v, n]) => <option key={v} value={v}>{n}</option>)}
          </select>
        </label>
        {hasVisa && (
          <label className="space-y-1.5 text-sm text-mist sm:col-span-2">
            In
            <select value={visaCountry} onChange={(e) => setVisaCountry(e.target.value as Market)} className={select}>
              {MARKETS.map((m) => <option key={m} value={m}>{MARKET_NAME[m]}</option>)}
            </select>
          </label>
        )}
      </div>

      <ul className="mt-6 grid gap-3 sm:grid-cols-3" aria-live="polite">
        {MARKETS.map((m) => {
          const v = VERDICT[rights[m]];
          return (
            <li key={m} className="rounded-2xl border border-haze bg-night/50 p-4">
              <p className="font-display text-lg font-semibold">{MARKET_NAME[m]}</p>
              <p className={`mt-2 w-fit rounded-full border px-2.5 py-0.5 text-xs font-medium ${v.tone}`}>{v.label}</p>
              <p className="mt-2 text-sm leading-snug text-mist">{v.detail}</p>
            </li>
          );
        })}
      </ul>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={(e) => openMaya(e, `I have a ${passportName} passport${hasVisa ? ` and I'm ${SITUATIONS.find(([v]) => v === situation)?.[1].toLowerCase()} in the ${MARKET_NAME[visaCountry]}` : ""}. Find me jobs I can actually take.`)}
          className="btn-light !px-5 !py-2.5 text-sm"
        >
          Show me jobs I can take
        </button>
        <span className="text-xs text-mist">General rules, not legal advice. Your university&apos;s visa advisers can confirm.</span>
      </div>
    </div>
  );
}

export function RightsSection() {
  return (
    <section id="rights" aria-labelledby="rights-h" className="mx-auto max-w-6xl scroll-mt-16 px-4 py-28 sm:px-6 sm:py-36">
      <div className="grid gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:items-center lg:gap-16">
        <div>
          <h2 id="rights-h" className="max-w-[12ch] font-display text-[clamp(2.2rem,5.5vw,4.5rem)] font-semibold leading-[1] tracking-[-0.035em]">
            Where can you actually work?
          </h2>
          <p className="mt-6 max-w-[30rem] text-lg leading-relaxed text-mist">
            It depends on your passport and the visa you hold now. An EU passport opens the Netherlands and Ireland but not the UK; a UK Graduate visa lets you start anywhere in Britain. Maya works this out first, so you never waste an application on a job you can&apos;t take.
          </p>
        </div>
        <RightsCheck />
      </div>
    </section>
  );
}
