import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Stamp } from "@/components/chat/stamp";
import { SiteFooter, SiteHeader } from "@/app/sponsors/_components/site-chrome";
import { prettyCompany } from "@/lib/employer";
import { SITE_URL } from "@/lib/site";
import { getSponsor, openUsJobCount, statsOf, topSponsors } from "@/lib/server/sponsors";
import { familyBreakdown, sponsorBadge, topFamily } from "@/lib/sponsor";
import { FAMILY_LABEL } from "@/lib/titles";

// Daily ISR: the top sponsors are prerendered at build, the long tail renders on first visit.
export const revalidate = 86400;
export const dynamicParams = true;

export async function generateStaticParams() {
  return (await topSponsors(500)).map((r) => ({ slug: r.slug }));
}

const num = (n: number) => n.toLocaleString("en-US");
const usd = (n: number | null) => (n ? `$${Math.round(n / 1000)}k` : "n/a");
const filings = (n: number) => `${num(n)} filing${n === 1 ? "" : "s"}`;
const longDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

export async function generateMetadata({ params }: PageProps<"/sponsors/[slug]">): Promise<Metadata> {
  const r = await getSponsor((await params).slug);
  if (!r) return { title: "Sponsor not found · H1Bound" };
  const name = prettyCompany(r.display_name ?? r.name);
  const top = familyBreakdown(r.by_family).find((f) => f.family !== "other");
  const title = `Does ${name} sponsor H-1B? ${filings(r.total_filings)} in FY${r.fiscal_year}`;
  const description =
    `${name} filed ${filings(r.total_filings)} for H-1B workers in FY${r.fiscal_year}` +
    `${top ? `, most for ${FAMILY_LABEL[top.family].toLowerCase()}${top.medianWage ? ` at a median ${usd(top.medianWage)}` : ""}` : ""}. ` +
    `Roles, wages and states from US Dept. of Labor data.`;
  return { title, description, alternates: { canonical: `${SITE_URL}/sponsors/${r.slug}` }, openGraph: { title, description, type: "website" } };
}

export default async function SponsorPage({ params }: PageProps<"/sponsors/[slug]">) {
  const r = await getSponsor((await params).slug);
  if (!r) notFound();
  const jobs = await openUsJobCount(r);

  const name = prettyCompany(r.display_name ?? r.name);
  const families = familyBreakdown(r.by_family);
  const badge = sponsorBadge(statsOf(r), topFamily(r.by_family));
  const lead = families.find((f) => f.family !== "other");

  return (
    <main className="flex flex-1 flex-col">
      <SiteHeader />
      <article className="mx-auto w-full max-w-3xl flex-1 px-4 pb-20 pt-6 sm:px-6">
        <nav className="text-sm text-slate" aria-label="Breadcrumb">
          <Link href="/sponsors" className="hover:text-ink">H-1B sponsors</Link> <span aria-hidden>/</span> {name}
        </nav>

        <div className="mt-6 flex flex-wrap items-start justify-between gap-6">
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-[clamp(2rem,4.5vw,3rem)] font-extrabold leading-[1.05] tracking-[-0.02em]">Does {name} sponsor H-1B visas?</h1>
            {prettyCompany(r.name) !== name && <p className="mt-2 text-sm text-slate">Files with the Dept. of Labor as {r.name}.</p>}
          </div>
          <div className="pt-2"><Stamp badge={badge} animate /></div>
        </div>

        <p className="mt-6 text-lg leading-relaxed">
          {name} filed <strong>{filings(r.total_filings)}</strong> for H-1B workers in fiscal year {r.fiscal_year}
          {lead ? <>, most for {FAMILY_LABEL[lead.family].toLowerCase()}</> : null}.
          {r.total_filings >= 10
            ? " That's a real track record of sponsoring people, though every filing is for one specific role and person."
            : " That's a small number, so sponsorship here may depend on the team and role."}
        </p>

        <dl className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Fact label={`Filings in FY${r.fiscal_year}`} value={num(r.total_filings)} />
          <Fact label="Most recent filing" value={r.last_filed ? longDate(r.last_filed) : "Unknown"} />
          <Fact label="Top states" value={r.top_states.length ? r.top_states.slice(0, 3).join(", ") : "Unknown"} className="col-span-2 sm:col-span-1" />
        </dl>

        {jobs !== null && (
          <section className="mt-10 rounded-2xl border-2 border-ink bg-card p-6">
            <h2 className="font-display text-2xl font-bold">
              {jobs > 0 ? `${num(jobs)} open US job${jobs === 1 ? "" : "s"} at ${name} right now` : `No open US jobs at ${name} today`}
            </h2>
            <p className="mt-2 text-slate">
              {jobs > 0
                ? "Upload your resume and Maya ranks these against your skills, flags any posting that says it can't sponsor, and helps you reach the hiring manager."
                : "We check their job board every day. Upload your resume and Maya matches you to open roles here and at other employers with a filing record."}
            </p>
            <a href="/login?mode=signup" className="mt-5 inline-block rounded-xl bg-ink px-5 py-3 font-medium text-paper hover:opacity-90">Get matched to these jobs</a>
          </section>
        )}

        {families.length > 0 && (
          <section className="mt-12">
            <h2 className="font-display text-2xl font-bold">Filings by role</h2>
            <p className="mt-1 text-sm text-slate">Median is the annual wage offered on the filings, not what everyone is paid.</p>
            <div className="mt-4 overflow-x-auto rounded-2xl border border-line bg-card">
              <table className="w-full text-left text-[0.97rem]">
                <thead className="border-b border-line text-sm text-slate">
                  <tr><th scope="col" className="px-4 py-3 font-medium">Role family</th><th scope="col" className="px-4 py-3 text-right font-medium">Filings</th><th scope="col" className="px-4 py-3 text-right font-medium">Median wage</th></tr>
                </thead>
                <tbody>
                  {families.map((f) => (
                    <tr key={f.family} className="border-b border-line last:border-0">
                      <th scope="row" className="px-4 py-3 font-normal">{FAMILY_LABEL[f.family]}</th>
                      <td className="px-4 py-3 text-right tabular-nums">{num(f.count)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{usd(f.medianWage)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <section className="mt-12 space-y-3 text-[0.97rem] leading-relaxed text-slate">
          <h2 className="font-display text-xl font-bold text-ink">What this does and doesn&apos;t tell you</h2>
          <p>
            Before an employer can petition for an H-1B, it files a Labor Condition Application (LCA) with the US Dept. of Labor. We count the certified ones. A filing shows {name} has sponsored people in these roles; it isn&apos;t a visa approval and doesn&apos;t promise they&apos;ll sponsor you. Always confirm with the recruiter.
          </p>
          <p>Source: US Dept. of Labor LCA disclosures, FY{r.fiscal_year} Q3.</p>
        </section>

        {jobs === null && (
          <section className="mt-10 rounded-2xl border border-line bg-card p-6">
            <h2 className="font-display text-xl font-bold">Looking for roles that can sponsor you?</h2>
            <p className="mt-2 text-slate">Upload your resume and Maya matches you to open US jobs at employers with a real H-1B filing record.</p>
            <a href="/login?mode=signup" className="mt-5 inline-block rounded-xl bg-ink px-5 py-3 font-medium text-paper hover:opacity-90">Start free</a>
          </section>
        )}
      </article>
      <SiteFooter />
    </main>
  );
}

function Fact({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return (
    <div className={`rounded-xl border border-line bg-card px-4 py-3 ${className}`}>
      <dt className="text-sm text-slate">{label}</dt>
      <dd className="mt-1 font-display text-xl font-semibold">{value}</dd>
    </div>
  );
}
