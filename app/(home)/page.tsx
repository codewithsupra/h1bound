import Link from "next/link";
import { HeroAndBoard } from "@/components/landing/hero-board";
import { AskMayaBar, MayaPanel } from "@/components/landing/try-maya";
import { Bento } from "@/components/landing/sections/bento";
import { Faq } from "@/components/landing/sections/faq";
import { Numbers } from "@/components/landing/sections/numbers";
import { OptSection } from "@/components/landing/sections/opt-section";
import { Pricing } from "@/components/landing/sections/pricing";
import { Privacy } from "@/components/landing/sections/privacy";
import { Record } from "@/components/landing/sections/record";
import { SectionNav } from "@/components/landing/sections/section-nav";
import { StickyBar } from "@/components/landing/sections/sticky-bar";
import { Story } from "@/components/landing/sections/story";
import { WhyUs } from "@/components/landing/sections/why-us";
import { REFERRAL } from "@/lib/quota";
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
  // Throw instead of rendering an empty sky: with ISR, a failed regeneration keeps the last good page.
  const failed = pages.find((p) => p.error);
  if (failed) throw new Error(`landing data: ${failed.error!.message}`);
  const top = pages.flatMap((p) => (p.data ?? []) as Row[]);
  const [{ count: employers }, { count: jobs }, { count: boards }] = await Promise.all([
    db.from("companies").select("id", { count: "exact", head: true }),
    db.from("jobs").select("id", { count: "exact", head: true }).eq("active", true).eq("is_us", true),
    db.from("companies").select("id", { count: "exact", head: true }).not("board_kind", "is", null),
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
  const record = stripe
    ? {
        company: label(stripe), slug: stripe.slug, fiscalYear: stripe.fiscal_year, total: stripe.total_filings,
        roleCount: stripe.by_family.software_engineer?.count ?? 0, roleMedian: stripe.by_family.software_engineer?.medianWage ?? null,
        lastFiled: stripe.last_filed, states: stripe.top_states,
      }
    : null;
  // Real rows for the lookup tile: two of the biggest boards-backed sponsors plus Stripe.
  const samples = [...top.filter((r) => r.board_slug && r.board_slug !== "stripe").slice(0, 2), ...(stripe ? [stripe] : [])].map((r) => ({ name: label(r), total: r.total_filings }));
  return { lights, idle, demo, record, samples, employers: employers ?? 0, jobs: jobs ?? 0, boards: boards ?? 0, filings: top.reduce((a, r) => a + r.total_filings, 0) };
}

export default async function Home() {
  const d = await load();

  return (
    <main className="flex-1 overflow-x-clip">
      <SiteHeader fixed>
        <Link href="/login" className="rounded-full px-3 py-2 text-mist transition-colors hover:text-moon">Sign in</Link>
        <Link href="/login?mode=signup" className="btn-ghost !px-4 !py-2 text-sm">Create account</Link>
      </SiteHeader>
      <SectionNav />
      <MayaPanel />

      <HeroAndBoard lights={d.lights} idle={d.idle}>
        <div className="pointer-events-none relative z-10 mx-auto flex min-h-[100svh] max-w-6xl flex-col justify-start px-4 pb-14 pt-[17rem] sm:px-6 sm:pb-20 lg:justify-center lg:pb-10 lg:pt-28">
          <p className="rise text-sm text-mist" style={{ animationDelay: "2.2s" }}>
            Every light is a real company that filed H-1Bs this year. <span className="hidden sm:inline">Hover</span><span className="sm:hidden">Tap</span> one.
          </p>
          <h1 className="rise mt-4 max-w-[13ch] font-display text-[clamp(2.6rem,5.6vw,4.2rem)] font-semibold leading-[0.98] tracking-[-0.035em]" style={{ animationDelay: "2.5s" }}>
            Apply where you can actually stay.
          </h1>
          <p className="rise mt-6 max-w-[32rem] text-lg leading-relaxed text-mist" style={{ animationDelay: "2.8s" }}>
            Maya is an AI job buddy for international students. She matches your resume to open US jobs at employers with a real H-1B record, keeps your OPT clock, and helps you reach the person who decides.
          </p>
          <div className="rise mt-9" style={{ animationDelay: "3.1s" }}>
            <AskMayaBar />
            <p className="pointer-events-auto mt-4 text-sm text-mist">
              Free: 10 sponsor-verified jobs, no card. Try 5 without an account.{" "}
              <a href="#board" className="text-moon underline decoration-haze underline-offset-4 transition-colors hover:decoration-sodium">Or check a company first</a>
            </p>
          </div>
        </div>
      </HeroAndBoard>

      <Numbers
        figures={[
          { value: d.employers, label: "employers with certified H-1B filings this fiscal year" },
          { value: d.filings, label: "H-1B labor filings by the 3,000 biggest sponsors", note: "US Dept. of Labor, FY2026" },
          { value: d.jobs, label: "open US jobs at those employers today" },
          { value: d.boards, label: "career boards checked every morning" },
        ]}
      />
      {d.demo && <Story company={d.demo.company} badge={d.demo.badge} />}
      {d.record && <Record r={d.record} />}
      <OptSection />
      <WhyUs />
      <Bento inviteJobs={REFERRAL.jobsPerFriend} samples={d.samples} />
      <Privacy />
      <Pricing inviteJobs={REFERRAL.jobsPerFriend} />
      <Faq />

      <section id="final-cta" aria-labelledby="final-h" className="relative isolate overflow-hidden border-t border-haze">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(90%_70%_at_50%_0%,#1d2760_0%,#0d1330_65%)]" />
        <div className="mx-auto flex max-w-4xl flex-col items-center px-4 py-32 text-center sm:px-6 sm:py-40">
          <h2 id="final-h" className="max-w-[16ch] font-display text-[clamp(2.4rem,6vw,5rem)] font-semibold leading-[0.98] tracking-[-0.04em]">
            Your clock is running. Your next sponsor is one chat away.
          </h2>
          <p className="mt-6 max-w-[30rem] text-lg text-mist">Drop in your resume and see 5 matches with their H-1B record. No account needed.</p>
          <div className="mt-10 flex w-full justify-center"><AskMayaBar /></div>
        </div>
      </section>

      <footer className="border-t border-haze">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 text-sm sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <p className="font-display text-lg font-bold text-moon">H1Bound<span className="text-sodium">.</span></p>
            <p className="mt-3 max-w-sm text-mist">Data: US Dept. of Labor LCA disclosures, FY2026. A certified filing isn&apos;t a visa guarantee. Maya is an AI and can make mistakes.</p>
          </div>
          <nav aria-label="Product">
            <p className="font-medium text-moon">Product</p>
            <ul className="mt-3 space-y-2 text-mist">
              <li><Link className="hover:text-moon" href="/chat">Chat with Maya</Link></li>
              <li><Link className="hover:text-moon" href="/sponsors">Sponsor lookup</Link></li>
              <li><Link className="hover:text-moon" href="/opt-clock">OPT clock</Link></li>
              <li><a className="hover:text-moon" href="#pricing">Pricing</a></li>
            </ul>
          </nav>
          <nav aria-label="Account">
            <p className="font-medium text-moon">Account</p>
            <ul className="mt-3 space-y-2 text-mist">
              <li><Link className="hover:text-moon" href="/login?mode=signup">Create account</Link></li>
              <li><Link className="hover:text-moon" href="/login">Sign in</Link></li>
              <li><a className="hover:text-moon" href="#faq">FAQ</a></li>
            </ul>
          </nav>
        </div>
      </footer>
      <StickyBar />
    </main>
  );
}
