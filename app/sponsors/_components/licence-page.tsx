import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Stamp } from "@/components/chat/stamp";
import { SiteFooter, SiteHeader } from "@/app/sponsors/_components/site-chrome";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import { sponsorName } from "@/lib/slug";
import { licenceBySlug, licenceHref, licenceName, openJobs, type LicenceRow } from "@/lib/server/licences";
import { licenceLine, MARKET_NAME, permitTotal, type Market } from "@/lib/visa";

/**
 * Public pages for register entries: /sponsors/uk/<slug>, /sponsors/nl/<slug>, /sponsors/ie/<slug>.
 * Answers "does X sponsor visas in <country>?" from the official register, plus the open jobs we see.
 */

const REGISTER: Record<Market, { name: string; url: string; visa: string }> = {
  GB: { name: "UK Home Office register of licensed sponsors", url: "https://www.gov.uk/government/publications/register-of-licensed-sponsors-workers", visa: "a Skilled Worker visa" },
  NL: { name: "IND public register of recognised sponsors", url: "https://ind.nl/en/public-register-recognised-sponsors/public-register-regular-labour-and-highly-skilled-migrants", visa: "a Dutch highly skilled migrant visa" },
  IE: { name: "Irish Dept. of Enterprise employment permit statistics", url: "https://enterprise.gov.ie/en/what-we-do/workplace-and-skills/employment-permits/statistics/", visa: "an Irish employment permit" },
};

const longDate = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const nameOf = (l: LicenceRow) => sponsorName(licenceName(l));

function verdict(l: LicenceRow): { yes: boolean; text: string } {
  const where = MARKET_NAME[l.country];
  if (!l.listed) return { yes: false, text: `${nameOf(l)} is no longer on the latest ${REGISTER[l.country].name}.` };
  if (l.country === "IE") {
    const n = permitTotal(l);
    return n ? { yes: true, text: `${nameOf(l)} was granted ${n.toLocaleString("en-GB")} Irish employment permit${n === 1 ? "" : "s"} for staff in the latest figures.` } : { yes: false, text: `No Irish employment permits recorded for ${nameOf(l)}.` };
  }
  if (l.country === "GB" && l.rating === "B") return { yes: true, text: `${nameOf(l)} holds a UK sponsor licence, but it's B-rated: the Home Office has asked them to improve, and they can't take on new sponsored workers until it's upgraded.` };
  return { yes: true, text: `Yes. ${nameOf(l)} is on the ${REGISTER[l.country].name}, so it can sponsor ${REGISTER[l.country].visa} in the ${where}.` };
}

export async function licenceMetadata(country: Market, params: Promise<{ slug: string }>): Promise<Metadata> {
  const l = await licenceBySlug(country, (await params).slug);
  if (!l) return { title: `Sponsor not found · ${SITE_NAME}` };
  const name = nameOf(l);
  const where = MARKET_NAME[country];
  const title = country === "IE" ? `Does ${name} sponsor work permits in Ireland?` : `Is ${name} a licensed visa sponsor in the ${where}?`;
  const description = `${verdict(l).text} Official register data, updated ${longDate(l.source_date)}, plus open jobs.`;
  return { title: `${title} · ${SITE_NAME}`, description, alternates: { canonical: `${SITE_URL}${licenceHref(l)}` }, openGraph: { title, description, type: "website" } };
}

export async function LicencePage({ country, params }: { country: Market; params: Promise<{ slug: string }> }) {
  const l = await licenceBySlug(country, (await params).slug);
  if (!l) notFound();
  const { jobs, count } = await openJobs(l.id);
  const name = nameOf(l);
  const where = MARKET_NAME[country];
  const v = verdict(l);
  const badge = { level: v.yes ? ("strong" as const) : ("none" as const), label: v.yes ? (country === "IE" ? "Permits issued" : "On the register") : "Not listed", detail: licenceLine(l) };
  const facts: [string, string][] = [
    ...(country === "GB" ? [["Licence rating", l.rating ?? "Listed"] as [string, string], ["Visa routes", l.routes.join(", ")] as [string, string]] : []),
    ...(country === "IE" ? Object.entries(l.permits).sort(([a], [b]) => b.localeCompare(a)).map(([y, n]) => [`Permits issued in ${y}`, n.toLocaleString("en-GB")] as [string, string]) : []),
    ...(country === "NL" && l.reg_id ? [["KVK number", l.reg_id] as [string, string]] : []),
    ...(l.city ? [["Registered in", [l.city, l.region].filter(Boolean).join(", ")] as [string, string]] : []),
    ["Register checked", longDate(l.source_date)],
  ];

  return (
    <main className="flex flex-1 flex-col">
      <SiteHeader />
      <article className="mx-auto w-full max-w-3xl flex-1 px-4 pb-20 pt-6 sm:px-6">
        <nav className="text-sm text-slate" aria-label="Breadcrumb">
          <Link href="/#board" className="hover:text-ink">Visa sponsors</Link> <span aria-hidden>/</span> {where} <span aria-hidden>/</span> {name}
        </nav>
        <h1 className="mt-6 font-display text-[clamp(2rem,4.5vw,3rem)] font-extrabold leading-[1.05] tracking-[-0.02em]">
          {country === "IE" ? `Does ${name} sponsor work permits in Ireland?` : `Is ${name} a licensed visa sponsor in the ${where}?`}
        </h1>
        {sponsorName(l.name) !== name && <p className="mt-2 text-sm text-slate">Listed as {l.name}.</p>}
        <div className="mt-6"><Stamp badge={badge} animate /></div>

        <p className="mt-6 text-lg leading-relaxed">{v.text} A licence means they can sponsor, not that every role will; the salary and the role still have to qualify.</p>

        <dl className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
          {facts.map(([k, val]) => (
            <div key={k} className="glass rounded-2xl px-4 py-3">
              <dt className="text-sm text-slate">{k}</dt>
              <dd className="mt-1 font-display text-lg font-semibold">{val}</dd>
            </div>
          ))}
        </dl>

        <section className="glass relative mt-10 overflow-hidden rounded-3xl p-6 ring-1 ring-sodium/40">
          <h2 className="font-display text-2xl font-bold">
            {count > 0 ? `${count.toLocaleString("en-GB")} open job${count === 1 ? "" : "s"} at ${name} we can match you to` : `No open jobs at ${name} in our feeds today`}
          </h2>
          {jobs.length > 0 && (
            <ul className="mt-4 divide-y divide-haze">
              {jobs.map((j) => (
                <li key={j.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2.5">
                  <a href={j.url} target="_blank" rel="noopener noreferrer" className="font-medium hover:underline">{j.title}</a>
                  <span className="text-sm text-slate">{j.remote ? "Remote" : j.location}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 text-slate">
            Upload your CV and Maya ranks these against your skills and visa, flags any posting that rules out sponsorship, and helps you reach the hiring manager.
          </p>
          <a href={`/chat?ask=${encodeURIComponent(`Find me jobs at ${name}`)}`} className="btn-light mt-5">Get matched, no signup</a>
        </section>

        <section className="mt-12 space-y-3 text-[0.97rem] leading-relaxed text-slate">
          <h2 className="font-display text-xl font-bold text-ink">Where this comes from</h2>
          <p>
            Source: <a href={REGISTER[country].url} target="_blank" rel="noopener noreferrer" className="underline">{REGISTER[country].name}</a>, checked {longDate(l.source_date)}.
            {country === "GB" ? " In the UK, only employers on this register can sponsor a Skilled Worker visa." : country === "NL" ? " In the Netherlands, only recognised sponsors can apply for a highly skilled migrant permit for you." : " Ireland has no sponsor licence; a permit history shows the employer has hired from abroad."}
          </p>
          <p>This is general information, not legal advice. Your university&apos;s visa advisers or an immigration adviser can confirm your situation.</p>
        </section>
      </article>
      <SiteFooter />
    </main>
  );
}
