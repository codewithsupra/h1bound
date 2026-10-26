import { Stamp } from "@/components/chat/stamp";
import { SponsorLookup } from "@/components/landing/sponsor-lookup";
import { createAdminInsForge } from "@/lib/insforge/admin";
import { sponsorBadge, type SponsorStats } from "@/lib/sponsor";

export const revalidate = 86400;

type Row = { name: string; display_name: string | null; fiscal_year: number; total_filings: number; by_family: SponsorStats["byFamily"]; last_filed: string | null };

async function heroExample() {
  const { data } = await createAdminInsForge()
    .database.from("companies")
    .select("name,display_name,fiscal_year,total_filings,by_family,last_filed")
    .eq("board_slug", "stripe")
    .maybeSingle();
  const r = data as Row | null;
  if (!r) return null;
  return { company: r.display_name ?? "Stripe", badge: sponsorBadge({ fiscalYear: r.fiscal_year, total: r.total_filings, byFamily: r.by_family, lastFiled: r.last_filed }, "software_engineer") };
}

async function totals() {
  const db = createAdminInsForge().database;
  const [c, j] = await Promise.all([
    db.from("companies").select("id", { count: "exact", head: true }),
    db.from("jobs").select("id", { count: "exact", head: true }).eq("active", true).eq("is_us", true),
  ]);
  return { companies: c.count ?? 0, jobs: j.count ?? 0 };
}

const PRO = [
  "Unlimited matches, with new sponsor jobs every morning",
  "Cold emails: Maya finds the hiring manager or CTO and drafts the email",
  "A 7-day interview plan for each job",
  "Resume tailoring for each job",
  "Follow-up reminders by email",
];

export default async function Home() {
  const [ex, t] = await Promise.all([heroExample(), totals()]);

  return (
    <main className="flex-1">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <a href="/" className="font-display text-xl font-bold">H1Bound</a>
        <nav className="flex items-center gap-2 text-sm">
          <a href="/login" className="rounded-lg px-3 py-2 text-slate hover:text-ink">Sign in</a>
          <a href="/login?mode=signup" className="rounded-lg bg-ink px-3.5 py-2 font-medium text-paper hover:opacity-90">Start free</a>
        </nav>
      </header>

      <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-20 pt-8 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:pt-16">
        <div>
          <h1 className="font-display text-[clamp(2.4rem,5.5vw,4.2rem)] font-extrabold leading-[1.02] tracking-[-0.02em]">
            Stop applying to companies that were never going to sponsor you.
          </h1>
          <p className="mt-6 max-w-[34rem] text-lg leading-relaxed text-slate">
            Maya is an AI job buddy for international students. Upload your resume and she matches you to US jobs at employers with a real H-1B filing record, then helps you reach the person who decides.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <a href="/login?mode=signup" className="rounded-xl bg-ink px-5 py-3 font-medium text-paper hover:opacity-90">Upload your resume, free</a>
            <a href="#lookup" className="font-medium underline underline-offset-4">Check a company first</a>
          </div>
          <p className="mt-6 text-sm text-slate">
            {t.companies.toLocaleString("en-US")} sponsoring employers from FY2026 Dept. of Labor filings{t.jobs ? `, ${t.jobs.toLocaleString("en-US")} open US jobs today` : ""}.
          </p>
        </div>

        <div className="rounded-2xl border border-line bg-card p-5 shadow-[0_1px_0_var(--line)] sm:p-6" aria-label="Example conversation with Maya">
          <p className="ml-auto max-w-[80%] rounded-2xl rounded-br-md bg-ink px-4 py-2.5 text-paper">I&apos;m on STEM OPT, backend + Python. Who&apos;s actually hiring people like me?</p>
          <p className="mt-4 max-w-[92%] leading-relaxed">Found a few good ones. This one&apos;s the strongest on sponsorship:</p>
          {ex && (
            <div className="mt-3 rounded-xl border border-line p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-display font-semibold">Software Engineer, Backend</p>
                  <p className="text-sm text-slate">{ex.company} · New York, NY</p>
                </div>
                <Stamp badge={ex.badge} animate />
              </div>
              <p className="mt-3 text-sm text-slate">{ex.badge.detail}</p>
            </div>
          )}
          <p className="mt-4 max-w-[92%] leading-relaxed">Want me to find their backend eng manager and draft a cold email?</p>
          <p className="mt-5 text-xs text-slate">Maya is an AI. Example job for illustration; filing numbers are real.</p>
        </div>
      </section>

      <section id="lookup" className="border-y border-line py-20">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <h2 className="font-display text-3xl font-bold tracking-[-0.01em] sm:text-4xl">Does this company sponsor?</h2>
          <p className="mt-3 max-w-[38rem] text-slate">
            Every H-1B starts with a labor filing to the US Dept. of Labor. We count them per company and role, so you can see who sponsors people like you, before you apply. No signup.
          </p>
          <div className="mt-8">
            <SponsorLookup />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <h2 className="font-display text-3xl font-bold tracking-[-0.01em] sm:text-4xl">Free to start. Pro when you&apos;re ready to push.</h2>
        <div className="mt-10 grid gap-6 md:grid-cols-2">
          <div className="rounded-2xl border border-line bg-card p-6">
            <p className="font-display text-xl font-semibold">Free</p>
            <p className="mt-1 text-3xl font-bold">$0</p>
            <ul className="mt-5 space-y-2.5 text-[0.97rem]">
              <li>10 matched jobs, each with its sponsorship record</li>
              <li>Resume reviews on 5 of those jobs (15 rounds in total)</li>
              <li>Chat with Maya about your search, any time</li>
            </ul>
            <a href="/login?mode=signup" className="mt-6 inline-block rounded-xl border border-line px-4 py-2.5 font-medium hover:bg-paper">Start free</a>
          </div>
          <div className="rounded-2xl border-2 border-ink bg-card p-6">
            <p className="font-display text-xl font-semibold">Pro</p>
            <p className="mt-1 text-3xl font-bold">$12<span className="text-base font-medium text-slate">/month</span></p>
            <p className="text-sm text-slate">₹399/month in India. Cancel anytime.</p>
            <ul className="mt-5 space-y-2.5 text-[0.97rem]">
              {PRO.map((p) => <li key={p}>{p}</li>)}
            </ul>
            <a href="/login?mode=signup" className="mt-6 inline-block rounded-xl bg-ink px-4 py-2.5 font-medium text-paper hover:opacity-90">Start free, upgrade in chat</a>
          </div>
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-sm text-slate sm:flex-row sm:justify-between sm:px-6">
          <p>Sponsorship data: US Dept. of Labor LCA disclosures, FY2026 Q3. A filing isn&apos;t a visa guarantee.</p>
          <p>Your resume is read once and stored encrypted. Delete everything anytime from your account.</p>
        </div>
      </footer>
    </main>
  );
}
