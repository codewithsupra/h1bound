import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteFooter, SiteHeader } from "@/app/sponsors/_components/site-chrome";
import { COMPARISONS, comparison, ourPrice } from "@/lib/compare";
import { PAYMENTS_LIVE } from "@/lib/billing";
import { SITE_NAME, SITE_URL } from "@/lib/site";

export function generateStaticParams() {
  return COMPARISONS.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata(props: PageProps<"/compare/[slug]">): Promise<Metadata> {
  const c = comparison((await props.params).slug);
  if (!c) return {};
  return {
    title: `${SITE_NAME} vs ${c.name}: which is right for you? · ${SITE_NAME}`,
    description: c.oneLine,
    alternates: { canonical: `${SITE_URL}/compare/${c.slug}` },
  };
}

const checked = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export default async function ComparePage(props: PageProps<"/compare/[slug]">) {
  const c = comparison((await props.params).slug);
  if (!c) notFound();
  const rows = c.rows.map((r) => (r.topic === "Price" ? { ...r, us: ourPrice(PAYMENTS_LIVE) } : r));
  return (
    <main className="flex flex-1 flex-col">
      <SiteHeader />
      <article className="mx-auto w-full max-w-5xl flex-1 px-4 pb-20 pt-6 sm:px-6">
        <p className="text-sm text-slate"><Link href="/compare" className="hover:underline">Comparisons</Link></p>
        <h1 className="mt-2 font-display text-[clamp(2rem,4.5vw,3rem)] font-extrabold leading-[1.05] tracking-[-0.02em]">{SITE_NAME} vs {c.name}</h1>
        <p className="mt-4 max-w-[44rem] text-lg leading-relaxed text-slate">{c.oneLine}</p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-line bg-card p-5"><p className="font-display font-semibold">Choose {c.name} if</p><p className="mt-2 text-slate">{c.chooseThem}</p></div>
          <div className="rounded-2xl border border-sodium/40 bg-card p-5"><p className="font-display font-semibold">Choose {SITE_NAME} if</p><p className="mt-2 text-slate">{c.chooseUs}</p></div>
        </div>

        <div className="mt-10 overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead className="text-slate"><tr className="border-b border-line"><th className="w-40 py-2 pr-4 font-medium" /><th className="py-2 pr-4 font-medium">{SITE_NAME}</th><th className="py-2 font-medium">{c.name}</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.topic} className="border-b border-line align-top">
                  <th scope="row" className="py-3 pr-4 font-medium">{r.topic}</th>
                  <td className="py-3 pr-4 leading-relaxed">{r.us}</td>
                  <td className="py-3 leading-relaxed text-slate">{r.them}{r.source && <> <a href={r.source} target="_blank" rel="noopener noreferrer nofollow" className="text-xs underline underline-offset-2">source</a></>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <section className="mt-12 max-w-[44rem] space-y-2 text-sm leading-relaxed text-slate">
          <p>We checked {c.name}&apos;s public pages on {checked(c.checkedOn)}. Products change; if something here is out of date, tell us and we&apos;ll fix it. Numbers on other companies&apos; sites are their own claims.</p>
          <ul className="list-disc pl-5">
            {c.sources.map((s) => <li key={s.url}><a href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="underline underline-offset-2">{s.label}</a></li>)}
          </ul>
        </section>

        <div className="mt-10 flex flex-wrap gap-3">
          <Link href="/chat" className="btn-light">Try Maya free</Link>
          <Link href="/sponsors/hiring" className="btn-ghost">See sponsors hiring now</Link>
        </div>
      </article>
      <SiteFooter />
    </main>
  );
}
