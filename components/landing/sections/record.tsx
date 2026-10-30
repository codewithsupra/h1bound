import Link from "next/link";

export type RecordData = {
  company: string;
  slug: string | null;
  fiscalYear: number;
  total: number;
  roleCount: number;
  roleMedian: number | null;
  lastFiled: string | null;
  states: string[];
};

const usd = (n: number) => `$${Math.round(n / 1000)}K`;
const day = (s: string) => new Date(`${s}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/** Our signature: the generic "sponsors visas" badge next to the actual filing record. */
export function Record({ r }: { r: RecordData }) {
  const facts: [string, string][] = [
    [`Certified H-1B filings, FY${r.fiscalYear}`, r.total.toLocaleString("en-US")],
    ["For software engineers", r.roleCount.toLocaleString("en-US")],
    ["Median software engineer wage on file", r.roleMedian ? usd(r.roleMedian) : "Not enough data"],
    ["Most recent filing", r.lastFiled ? day(r.lastFiled) : "Not in this period"],
    ["Where they file most", r.states.slice(0, 3).join(", ") || "Not listed"],
  ];
  return (
    <section id="record" aria-labelledby="record-h" className="relative scroll-mt-16 overflow-hidden border-y border-haze bg-[#0a0f28] py-28 sm:py-36">
      <div className="pointer-events-none absolute left-1/2 top-0 h-[480px] w-[900px] -translate-x-1/2 rounded-full bg-sodium/[0.07] blur-3xl" />
      <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
        <h2 id="record-h" className="max-w-[15ch] font-display text-[clamp(2.2rem,5.5vw,4.5rem)] font-semibold leading-[1] tracking-[-0.035em]">
          A badge says maybe. The record says how often.
        </h2>
        <p className="mt-6 max-w-[38rem] text-lg leading-relaxed text-mist">
          Most job sites stop at a checkmark. Every H-1B starts with a labor filing to the Dept. of Labor, so we show you the filings themselves: how many, for which roles, at what pay, and how recently.
        </p>

        <div className="mt-16 grid items-center gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
          <figure className="mx-auto w-full max-w-sm text-center">
            <div className="relative rounded-3xl border border-haze bg-night-2/60 px-8 py-12">
              <span className="inline-flex items-center gap-2 rounded-full bg-green/15 px-4 py-2 font-medium text-green">
                <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden><path d="M8.2 13.6 4.6 10l-1.2 1.2 4.8 4.8L17 7.2 15.8 6z" /></svg>
                Sponsors visas
              </span>
              <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="absolute inset-x-6 top-1/2 h-10 w-[calc(100%-3rem)] -translate-y-1/2 text-red" aria-hidden>
                <line x1="2" y1="36" x2="98" y2="4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
            </div>
            <figcaption className="mt-4 text-sm text-mist">Since when? For which roles? Nobody says.</figcaption>
          </figure>

          <figure className="glass rounded-[2rem] p-6 sm:p-9">
            <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-haze pb-5">
              <p className="font-display text-2xl font-semibold">{r.company}</p>
              <p className="text-sm text-mist">US Dept. of Labor LCA disclosures</p>
            </div>
            <dl className="divide-y divide-haze">
              {facts.map(([k, v]) => (
                <div key={k} className="flex items-baseline justify-between gap-6 py-4">
                  <dt className="text-mist">{k}</dt>
                  <dd className="text-right font-display text-xl font-semibold sm:text-2xl">{v}</dd>
                </div>
              ))}
            </dl>
            <figcaption className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm text-mist">
              <span>A certified filing isn&apos;t an approved visa, but it&apos;s the strongest public signal there is.</span>
              {r.slug && <Link href={`/sponsors/${r.slug}`} className="text-moon underline decoration-haze underline-offset-4 hover:decoration-sodium">See the full record</Link>}
            </figcaption>
          </figure>
        </div>
      </div>
    </section>
  );
}
