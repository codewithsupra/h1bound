import Link from "next/link";
import { FlightPath } from "@/components/landing/flight-path";
import { HeroAndBoard } from "@/components/landing/hero-board";
import { MayaDemo } from "@/components/landing/maya-demo";
import { AskMayaBar, MayaPanel } from "@/components/landing/try-maya";
import { SiteHeader } from "@/components/site/site-header";
import type { BoardRow } from "@/components/landing/flap-board";
import type { Light } from "@/components/landing/night-map";
import { companyLabel } from "@/lib/employer";
import { createAdminInsForge } from "@/lib/insforge/admin";
import { sponsorBadge, sponsorLevel, type SponsorStats } from "@/lib/sponsor";

export const revalidate = 86400;

type Row = { slug: string | null; name: string; display_name: string | null; top_states: string[]; fiscal_year: number; total_filings: number; by_family: SponsorStats["byFamily"]; last_filed: string | null; board_slug: string | null };

const stats = (r: Row): SponsorStats => ({ fiscalYear: r.fiscal_year, total: r.total_filings, byFamily: r.by_family, lastFiled: r.last_filed });
const label = (r: Row) => companyLabel(r.display_name, r.name);

async function load() {
  const db = createAdminInsForge().database;
  const cols = "slug,name,display_name,top_states,fiscal_year,total_filings,by_family,last_filed,board_slug";
  const pages = await Promise.all([0, 1, 2].map((p) => db.from("companies").select(cols).order("total_filings", { ascending: false }).range(p * 1000, p * 1000 + 999)));
  const top = pages.flatMap((p) => (p.data ?? []) as Row[]);
  const [{ count: employers }, { count: jobs }] = await Promise.all([
    db.from("companies").select("id", { count: "exact", head: true }),
    db.from("jobs").select("id", { count: "exact", head: true }).eq("active", true).eq("is_us", true),
  ]);

  const lights: Light[] = top.filter((r) => r.top_states[0]).map((r) => ({ n: label(r), f: r.total_filings, s: r.top_states[0] }));
  const idle: BoardRow[] = top
    .filter((r) => r.board_slug)
    .slice(0, 40)
    .map((r) => ({
      name: label(r),
      slug: r.slug,
      total: r.total_filings,
      roleCount: r.by_family.software_engineer?.count ?? 0,
      median: r.by_family.software_engineer?.medianWage ?? null,
      level: sponsorLevel(stats(r), "software_engineer"),
    }));
  const stripe = top.find((r) => r.board_slug === "stripe");
  const demo = stripe ? { company: label(stripe), badge: sponsorBadge(stats(stripe), "software_engineer") } : null;
  return { lights, idle, demo, employers: employers ?? 0, jobs: jobs ?? 0, filings: top.reduce((a, r) => a + r.total_filings, 0) };
}

export default async function Home() {
  const d = await load();
  const fmt = (n: number) => n.toLocaleString("en-US");

  return (
    <main className="flex-1 overflow-x-clip">
      <SiteHeader fixed>
        <Link href="/login" className="rounded-full px-3 py-2 text-mist transition-colors hover:text-moon">Sign in</Link>
        <Link href="/login?mode=signup" className="btn-ghost !px-4 !py-2 text-sm">Create account</Link>
      </SiteHeader>
      <MayaPanel />

      <HeroAndBoard lights={d.lights} idle={d.idle}>
        <div className="pointer-events-none relative z-10 mx-auto flex min-h-[100svh] max-w-6xl flex-col justify-end px-4 pb-16 pt-28 sm:px-6 sm:pb-20 lg:justify-center lg:pb-10">
          <p className="rise text-sm text-mist" style={{ animationDelay: "2.2s" }}>
            Every light is a real company that filed H-1Bs this year. Hover one.
          </p>
          <h1 className="rise mt-4 max-w-[13ch] font-display text-[clamp(2.6rem,5.6vw,4.2rem)] font-semibold leading-[0.98] tracking-[-0.035em]" style={{ animationDelay: "2.5s" }}>
            Apply where you can actually stay.
          </h1>
          <p className="rise mt-6 max-w-[32rem] text-lg leading-relaxed text-mist" style={{ animationDelay: "2.8s" }}>
            Maya is an AI job buddy for international students. She matches your resume to open US jobs at employers with a real H-1B record, then helps you reach the person who decides.
          </p>
          <div className="rise mt-9" style={{ animationDelay: "3.1s" }}>
            <AskMayaBar />
            <p className="pointer-events-auto mt-4 text-sm text-mist">
              No account needed: try it on your resume and see 5 matches.{" "}
              <a href="#board" className="text-moon underline decoration-haze underline-offset-4 transition-colors hover:decoration-sodium">Or check a company first</a>
            </p>
          </div>
          <dl className="rise mt-12 flex flex-wrap gap-x-10 gap-y-3 text-sm" style={{ animationDelay: "3.4s" }}>
            <div><dt className="text-mist">Sponsoring employers</dt><dd className="font-flap text-xl text-moon">{fmt(d.employers)}</dd></div>
            <div><dt className="text-mist">Open US jobs today</dt><dd className="font-flap text-xl text-moon">{fmt(d.jobs)}</dd></div>
            <div><dt className="text-mist">Lights on this map</dt><dd className="font-flap text-xl text-sodium">{fmt(d.lights.length)}</dd></div>
          </dl>
        </div>
      </HeroAndBoard>

      <section className="mx-auto grid max-w-6xl items-center gap-14 px-4 py-28 sm:px-6 lg:grid-cols-[1fr_1.05fr]">
        <div>
          <h2 className="font-display text-[clamp(1.9rem,4vw,3rem)] font-semibold leading-[1.05] tracking-[-0.02em]">
            Talks like a friend in recruiting. Never pretends to be one.
          </h2>
          <p className="mt-5 max-w-[34rem] text-lg leading-relaxed text-mist">
            Maya asks one thing at a time, remembers your OPT clock, and only cites numbers from public filings. She&apos;s an AI, and says so.
          </p>
        </div>
        {d.demo && <MayaDemo company={d.demo.company} badge={d.demo.badge} />}
      </section>

      <section className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
        <h2 className="mb-14 font-display text-[clamp(1.9rem,4vw,3rem)] font-semibold tracking-[-0.02em]">Your route</h2>
        <FlightPath />
      </section>

      <section className="mx-auto max-w-6xl px-4 py-28 sm:px-6">
        <h2 className="font-display text-[clamp(1.9rem,4vw,3rem)] font-semibold tracking-[-0.02em]">Free to start.</h2>
        <div className="mt-12 grid gap-5 md:grid-cols-2">
          <div className="glass rounded-3xl p-7">
            <p className="font-display text-lg font-semibold">Free</p>
            <p className="mt-2 font-display text-5xl font-semibold tracking-tight">$0</p>
            <ul className="mt-7 space-y-3 text-mist">
              <li>10 matched jobs, each with its sponsorship record</li>
              <li>Resume reviews on 5 of them (15 rounds in total)</li>
              <li>Chat with Maya about your search</li>
            </ul>
            <Link href="/login?mode=signup" className="btn-ghost mt-8">Start free</Link>
          </div>
          <div className="glass relative overflow-hidden rounded-3xl p-7 ring-1 ring-sodium/40">
            <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-sodium/20 blur-3xl" />
            <p className="font-display text-lg font-semibold">Pro</p>
            <p className="mt-2 font-display text-5xl font-semibold tracking-tight">$12<span className="text-lg font-normal text-mist">/month</span></p>
            <p className="mt-1 text-sm text-mist">₹399/month in India. Cancel anytime.</p>
            <ul className="mt-7 space-y-3 text-mist">
              <li><span className="text-moon">Unlimited matches</span>, new sponsor jobs every morning</li>
              <li><span className="text-moon">Cold emails</span>: Maya finds the hiring manager or CTO and drafts it</li>
              <li><span className="text-moon">Interview plans</span> and <span className="text-moon">resume tailoring</span> per job</li>
              <li>Follow-up reminders by email</li>
            </ul>
            <Link href="/login?mode=signup" className="btn-light mt-8">Start free, upgrade in chat</Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-haze">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-10 text-sm text-mist sm:flex-row sm:justify-between sm:px-6">
          <p>Data: US Dept. of Labor LCA disclosures, FY2026 Q3 ({fmt(d.filings)} filings among the top 3,000 employers). A filing isn&apos;t a visa guarantee.</p>
          <p>Your resume is read once and stored encrypted. Delete everything anytime.</p>
        </div>
      </footer>
    </main>
  );
}
