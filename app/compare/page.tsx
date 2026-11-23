import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter, SiteHeader } from "@/app/sponsors/_components/site-chrome";
import { COMPARISONS } from "@/lib/compare";
import { SITE_NAME, SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: `${SITE_NAME} compared with other job-search tools · ${SITE_NAME}`,
  description: `How ${SITE_NAME} compares with Backdoor, Jobright and other AI job-search tools, for international students who need a visa sponsor.`,
  alternates: { canonical: `${SITE_URL}/compare` },
};

export default function CompareIndex() {
  return (
    <main className="flex flex-1 flex-col">
      <SiteHeader />
      <div className="mx-auto w-full max-w-5xl flex-1 px-4 pb-20 pt-6 sm:px-6">
        <h1 className="font-display text-[clamp(2rem,4.5vw,3rem)] font-extrabold leading-[1.05] tracking-[-0.02em]">How {SITE_NAME} compares</h1>
        <p className="mt-4 max-w-[44rem] text-lg leading-relaxed text-slate">Honest comparisons with other job-search tools, each with its sources and the date we checked. If another tool suits you better, the page says so.</p>
        <ul className="mt-8 grid gap-4 sm:grid-cols-2">
          {COMPARISONS.map((c) => (
            <li key={c.slug}>
              <Link href={`/compare/${c.slug}`} className="block rounded-2xl border border-line bg-card p-5 transition-colors hover:border-sodium/50">
                <p className="font-display text-lg font-semibold">{SITE_NAME} vs {c.name}</p>
                <p className="mt-2 text-sm text-slate">{c.oneLine}</p>
              </Link>
            </li>
          ))}
        </ul>
      </div>
      <SiteFooter />
    </main>
  );
}
