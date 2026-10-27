import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter, SiteHeader } from "@/app/sponsors/_components/site-chrome";
import { companyLabel } from "@/lib/employer";
import { SITE_URL } from "@/lib/site";
import { topSponsors, type SponsorRow } from "@/lib/server/sponsors";
import { topFamily } from "@/lib/sponsor";
import { FAMILY_LABEL, TITLE_FAMILIES, type TitleFamily } from "@/lib/titles";

export const revalidate = 86400;

const TOP = 200;

export const metadata: Metadata = {
  title: `Top ${TOP} H-1B sponsors in FY2026, by role · H1Bound`,
  description: `The ${TOP} employers with the most H-1B labor filings in fiscal year 2026, grouped by the roles they file for most. From US Dept. of Labor LCA data.`,
  alternates: { canonical: `${SITE_URL}/sponsors` },
};

export default async function SponsorsIndex() {
  const rows = await topSponsors(TOP);
  const groups = new Map<TitleFamily, SponsorRow[]>();
  for (const r of rows) {
    const f = topFamily(r.by_family);
    groups.set(f, [...(groups.get(f) ?? []), r]);
  }
  const ordered = TITLE_FAMILIES.filter((f) => groups.has(f)).sort((a, b) => groups.get(b)!.length - groups.get(a)!.length);

  return (
    <main className="flex flex-1 flex-col">
      <SiteHeader />
      <div className="mx-auto w-full max-w-6xl flex-1 px-4 pb-20 pt-6 sm:px-6">
        <h1 className="font-display text-[clamp(2rem,4.5vw,3rem)] font-extrabold leading-[1.05] tracking-[-0.02em]">Top {TOP} H-1B sponsors, by role</h1>
        <p className="mt-4 max-w-[42rem] text-lg leading-relaxed text-slate">
          The employers with the most H-1B labor filings in fiscal year 2026, grouped by the role they file for most. Each filing is one role for one person, and isn&apos;t a visa approval.
        </p>
        <nav className="mt-6 flex flex-wrap gap-2 text-sm" aria-label="Role families">
          {ordered.map((f) => (
            <a key={f} href={`#${f}`} className="rounded-full border border-line bg-card px-3 py-1.5 transition-colors hover:border-sodium/50">{FAMILY_LABEL[f]} <span className="text-slate">{groups.get(f)!.length}</span></a>
          ))}
        </nav>

        <div className="mt-12 space-y-14">
          {ordered.map((f) => (
            <section key={f} id={f} className="scroll-mt-6">
              <h2 className="font-display text-2xl font-bold">{FAMILY_LABEL[f]}</h2>
              <ol className="mt-4 grid gap-x-8 sm:grid-cols-2 lg:grid-cols-3">
                {groups.get(f)!.map((r) => (
                  <li key={r.id} className="border-b border-line">
                    <Link href={`/sponsors/${r.slug}`} className="flex items-baseline justify-between gap-3 py-2.5 hover:underline">
                      <span className="min-w-0 truncate font-medium">{companyLabel(r.display_name, r.name)}</span>
                      <span className="shrink-0 text-sm tabular-nums text-slate">{r.total_filings.toLocaleString("en-US")}</span>
                    </Link>
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>

        <p className="mt-14 text-sm text-slate">Source: US Dept. of Labor LCA disclosures, FY2026 Q3. Can&apos;t find a company? <Link href="/#lookup" className="underline underline-offset-4">Search all employers</Link>.</p>
      </div>
      <SiteFooter />
    </main>
  );
}
