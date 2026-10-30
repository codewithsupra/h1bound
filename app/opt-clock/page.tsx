import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter, SiteHeader } from "@/app/sponsors/_components/site-chrome";
import { MayaPanel } from "@/components/landing/try-maya";
import { OptCalculator } from "@/components/landing/sections/opt-calculator";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "OPT unemployment day calculator (90 / 150 days) · H1Bound",
  description: "Free OPT clock: see how many of your 90 F-1 OPT or 150 STEM OPT unemployment days are left and your last day, then find employers that actually sponsor H-1Bs.",
  alternates: { canonical: `${SITE_URL}/opt-clock` },
};

const RULES: [string, string][] = [
  ["F-1 OPT: 90 days", "During post-completion OPT you can be unemployed for up to 90 days in total. Days count from your EAD start date, whenever you aren't working."],
  ["STEM OPT: 150 days in total", "The 24-month STEM extension adds 60 days, for 150 across both periods. Days you used on regular OPT carry over."],
  ["What stops the clock", "Working at least 20 hours a week in a job related to your degree. On regular OPT some unpaid roles can count; STEM OPT needs a paid job with an E-Verify employer. Ask your DSO."],
  ["When it runs out", "Going over the limit can end your F-1 status. If you're close, talk to your DSO now about options, including school transfer or change of status."],
];

export default function OptClockPage() {
  return (
    <>
      <SiteHeader />
      <MayaPanel />
      <main className="flex-1">
        <section className="mx-auto max-w-4xl px-4 pb-16 pt-14 sm:px-6 sm:pt-20">
          <h1 className="max-w-[16ch] font-display text-[clamp(2.4rem,6vw,4.6rem)] font-semibold leading-[0.98] tracking-[-0.04em]">How many OPT days do you have left?</h1>
          <p className="mt-6 max-w-[36rem] text-lg leading-relaxed text-mist">
            Enter the unemployment days you&apos;ve used. It runs in your browser; nothing is saved or sent.
          </p>
          <div className="mt-10"><OptCalculator size="lg" /></div>
        </section>

        <section className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
          <h2 className="font-display text-3xl font-semibold tracking-[-0.02em]">How the OPT clock works</h2>
          <dl className="mt-8 grid gap-8 sm:grid-cols-2">
            {RULES.map(([t, d]) => (
              <div key={t} className="border-t border-haze pt-5">
                <dt className="font-display text-lg font-semibold">{t}</dt>
                <dd className="mt-2 leading-relaxed text-mist">{d}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-10 text-sm text-mist">
            This is general information, not legal advice. Your school&apos;s DSO and the official SEVP guidance on the{" "}
            <a className="text-moon underline decoration-haze underline-offset-4 hover:decoration-sodium" href="https://studyinthestates.dhs.gov/students/work/practical-training" target="_blank" rel="noopener noreferrer">Study in the States</a> site are the authority on your count.
          </p>
        </section>

        <section className="mx-auto max-w-4xl px-4 pb-28 pt-8 sm:px-6">
          <div className="glass rounded-[2rem] p-8 sm:p-10">
            <h2 className="font-display text-3xl font-semibold tracking-[-0.02em]">Spend the days on employers that sponsor.</h2>
            <p className="mt-3 max-w-[34rem] text-lg text-mist">Maya matches your resume to open jobs at employers with real H-1B filings, and keeps this clock for you.</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/chat" className="btn-light">Chat with Maya, free</Link>
              <Link href="/sponsors" className="btn-ghost">Browse top sponsors</Link>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
