import Link from "next/link";
import { HeroAndBoard } from "@/components/landing/hero-board";
import { AskMayaBar, MayaPanel } from "@/components/landing/try-maya";
import { Bento } from "@/components/landing/sections/bento";
import { Faq } from "@/components/landing/sections/faq";
import { Numbers } from "@/components/landing/sections/numbers";
import { Pricing } from "@/components/landing/sections/pricing";
import { Privacy } from "@/components/landing/sections/privacy";
import { Record } from "@/components/landing/sections/record";
import { RightsSection } from "@/components/landing/sections/rights-check";
import { SectionNav } from "@/components/landing/sections/section-nav";
import { StickyBar } from "@/components/landing/sections/sticky-bar";
import { Story } from "@/components/landing/sections/story";
import { WhyUs } from "@/components/landing/sections/why-us";
import { REFERRAL } from "@/lib/quota";
import { SiteHeader } from "@/components/site/site-header";
import { landingLicences, licenceHref, licenceName } from "@/lib/server/licences";
import { licenceLine } from "@/lib/visa";
import { SITE_NAME } from "@/lib/site";

export const revalidate = 86400;

const longDate = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

async function load() {
  const d = await landingLicences();
  const f = d.feature;
  const demo = f ? { company: licenceName(f.licence), role: f.role, city: f.city, badge: { level: "strong" as const, label: "Licensed sponsor", detail: licenceLine(f.licence) } } : null;
  const record = f
    ? {
        company: licenceName(f.licence),
        href: licenceHref(f.licence),
        register: "UK Home Office register of licensed sponsors",
        facts: [
          ["Licence rating", f.licence.rating === "A" ? "A (top rating)" : f.licence.rating ?? "Listed"],
          ["Visa routes", f.licence.routes.join(", ") || "Skilled Worker"],
          ["Registered in", f.licence.city ?? "United Kingdom"],
          ["Register checked", longDate(f.licence.source_date)],
          ["Open jobs we found today", f.jobs.toLocaleString("en-GB")],
        ] as [string, string][],
      }
    : null;
  const samples = [
    { name: "UK licensed sponsors", total: d.sponsors.GB },
    { name: "Dutch recognised", total: d.sponsors.NL },
    { name: "Irish permit employers", total: d.sponsors.IE },
  ];
  return { ...d, demo, record, samples };
}

export default async function Home() {
  const d = await load();

  return (
    <main className="flex-1 overflow-x-clip">
      <SiteHeader fixed>
        <Link href="/login" className="hidden whitespace-nowrap rounded-full px-3 py-2 text-mist transition-colors hover:text-moon sm:inline">Sign in</Link>
        <Link href="/login?mode=signup" className="btn-ghost whitespace-nowrap !px-4 !py-2 text-sm">Create account</Link>
      </SiteHeader>
      <SectionNav />
      <MayaPanel />

      <HeroAndBoard lights={d.lights} idle={d.idle}>
        <div className="pointer-events-none relative z-10 mx-auto flex min-h-[100svh] max-w-6xl flex-col justify-start px-4 pb-14 pt-[17rem] sm:px-6 sm:pb-20 lg:justify-center lg:pb-10 lg:pt-28">
          <p className="rise text-sm text-mist" style={{ animationDelay: "2.2s" }}>
            Every light is a company licensed to sponsor visas. <span className="hidden sm:inline">Hover</span><span className="sm:hidden">Tap</span> one.
          </p>
          <h1 className="rise mt-4 max-w-[13ch] font-display text-[clamp(2.6rem,5.6vw,4.2rem)] font-semibold leading-[0.98] tracking-[-0.035em]" style={{ animationDelay: "2.5s" }}>
            Apply where you can actually stay.
          </h1>
          <p className="rise mt-6 max-w-[32rem] text-lg leading-relaxed text-mist" style={{ animationDelay: "2.8s" }}>
            Maya is an AI job buddy for international students. She finds jobs in the UK, the Netherlands and Ireland, and remote roles, that you can legally take, checks every employer against the official sponsor registers, and helps you reach the person who decides.
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
          { value: d.sponsors.GB, label: "UK employers licensed to sponsor work visas", note: "UK Home Office register" },
          { value: d.sponsors.NL, label: "recognised sponsors in the Netherlands", note: "Dutch IND register" },
          { value: d.sponsors.IE, label: "employers granted Irish work permits since last year", note: "Irish Dept. of Enterprise" },
          { value: d.jobs, label: "open jobs in the UK, NL, Ireland and remote, refreshed every morning" },
        ]}
      />
      {d.demo && <Story company={d.demo.company} badge={d.demo.badge} role={d.demo.role} city={d.demo.city} />}
      {d.record && <Record r={d.record} />}
      <RightsSection />
      <WhyUs />
      <Bento inviteJobs={REFERRAL.jobsPerFriend} samples={d.samples} />
      <Privacy />
      <Pricing inviteJobs={REFERRAL.jobsPerFriend} />
      <Faq />

      <section id="final-cta" aria-labelledby="final-h" className="relative isolate overflow-hidden border-t border-haze">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(90%_70%_at_50%_0%,#1d2760_0%,#0d1330_65%)]" />
        <div className="mx-auto flex max-w-4xl flex-col items-center px-4 py-32 text-center sm:px-6 sm:py-40">
          <h2 id="final-h" className="max-w-[16ch] font-display text-[clamp(2.4rem,6vw,5rem)] font-semibold leading-[0.98] tracking-[-0.04em]">
            Your visa has a clock. Your next sponsor is one chat away.
          </h2>
          <p className="mt-6 max-w-[30rem] text-lg text-mist">Drop in your CV and see 5 matches you can actually take, with their sponsor record. No account needed.</p>
          <div className="mt-10 flex w-full justify-center"><AskMayaBar /></div>
        </div>
      </section>

      <footer className="border-t border-haze">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 text-sm sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <p className="font-display text-lg font-bold text-moon">{SITE_NAME}<span className="text-sodium">.</span></p>
            <p className="mt-3 max-w-sm text-mist">Sponsor data: UK Home Office register of licensed sponsors, Dutch IND public register of recognised sponsors, Irish Dept. of Enterprise employment permit statistics. A licence isn&apos;t a job offer or a visa. Remote jobs partly via Himalayas and Remote OK. Maya is an AI and can make mistakes.</p>
          </div>
          <nav aria-label="Product">
            <p className="font-medium text-moon">Product</p>
            <ul className="mt-3 space-y-2 text-mist">
              <li><Link className="hover:text-moon" href="/chat">Chat with Maya</Link></li>
              <li><a className="hover:text-moon" href="#board">Sponsor lookup</a></li>
              <li><a className="hover:text-moon" href="#rights">Visa check</a></li>
              <li><Link className="hover:text-moon" href="/sponsors">US H-1B sponsors</Link></li>
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
