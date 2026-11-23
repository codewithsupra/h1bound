/**
 * The visa-clock digest: a countdown to the end of the student or post-study visa, then the new
 * jobs at licensed sponsors since the last one. Paid plans get it daily with each job's salary
 * check; the free plan gets it weekly. Pure and client-safe; the cron is app/api/cron/daily-picks.
 *
 * Claims stay inside what the data says: "on the sponsor register" (never "will sponsor you"), and
 * a salary check that cites its floor or says the pay isn't stated.
 */
import { visaUrgency, type VisaUrgency } from "@/lib/pipeline";
import { MARKET_NAME, MARKETS, type Market, type VisaSituation } from "@/lib/visa";
import type { SalaryCheck } from "@/lib/salary";
import { newSponsorLine, type NewSponsor } from "@/lib/new-sponsors";

const DAY = 86_400_000;
/** Free plan: one digest a week. A little under 7 days, so it lands at the same chosen hour each week. */
export const FREE_DIGEST_GAP_MS = 6.5 * DAY;
/** Paid plan: one a day, with slack for the hourly cron. */
export const PAID_DIGEST_GAP_MS = 20 * 3_600_000;
/** Jobs in a free digest, while the free allowance lasts. */
export const FREE_DIGEST_JOBS = 3;

export function digestDue(s: { paidOrTrial: boolean; lastAt: number | null; now: number }): boolean {
  if (!s.lastAt) return true;
  return s.now - s.lastAt >= (s.paidOrTrial ? PAID_DIGEST_GAP_MS : FREE_DIGEST_GAP_MS);
}

/** What the visa is called where the person holds it, for "143 days left on your Graduate visa". */
export function visaName(situation: VisaSituation | null | undefined, country: string | null | undefined): string | null {
  const m = (MARKETS as string[]).includes(country ?? "") ? (country as Market) : null;
  if (situation === "graduate") return m === "GB" ? "Graduate visa" : m === "IE" ? "Stamp 1G" : m === "NL" ? "orientation year permit" : "post-study visa";
  if (situation === "student") return m === "IE" ? "Stamp 2 student permission" : m ? `${MARKET_NAME[m]} student visa` : "student visa";
  if (situation === "sponsored") return "work visa";
  return null;
}

export type Countdown = VisaUrgency & { line: string };

/**
 * The line the digest opens with. Null when there's no end date (the digest asks for one instead)
 * or no visa that runs out.
 */
export function visaCountdown(p: { visa_ends_on?: string | null; visa_situation?: VisaSituation | null; visa_country?: string | null }, now: number): Countdown | null {
  const u = visaUrgency(p.visa_ends_on, now);
  const name = visaName(p.visa_situation, p.visa_country);
  if (!u || !name) return null;
  const ends = new Date(`${p.visa_ends_on}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  if (u.level === "expired") return { ...u, line: `Your ${name} end date (${ends}) has passed. If that's wrong, update it in Your case.` };
  const days = `${u.days} day${u.days === 1 ? "" : "s"}`;
  const tail = u.level === "urgent" ? " To stay after it ends, you'll need a licensed sponsor: those jobs come first." : "";
  return { ...u, line: `${days} left on your ${name} (ends ${ends}).${tail}` };
}

export type DigestJob = {
  id: string; title: string; company: string; location: string; remote: boolean; url: string;
  badge: { label: string; detail: string };
  why?: string | null;
  /** Paid plans only. */
  salary?: SalaryCheck | null;
};

export type DigestInput = {
  firstName: string | null;
  paid: boolean;
  countdown: Countdown | null;
  jobs: DigestJob[];
  /** Free plan with its allowance used up: matching sponsor jobs this week that weren't shown. */
  hiddenCount: number;
  /** Employers new on the sponsor register since the last digest. */
  newSponsors?: NewSponsor[];
  appUrl: string;
  siteName: string;
  unsubscribeUrl: string;
};

const SALARY_MARK: Record<SalaryCheck["status"], string> = { meets: "Pay meets the visa floor", below: "Pay under the visa floor", depends: "Pay check: depends", unknown: "Pay check" };

/** Plain-text email. Returns null when there's nothing worth sending. */
export function digestEmail(d: DigestInput): { subject: string; text: string } | null {
  const fresh = d.newSponsors ?? [];
  if (!d.jobs.length && !d.hiddenCount && !fresh.length) return null;
  const ask = (q: string) => `${d.appUrl}/chat?ask=${encodeURIComponent(q)}`;
  const n = d.jobs.length;
  const period = d.paid ? "today" : "this week";

  const blocks = d.jobs.map((j) => [
    `${j.title} at ${j.company} (${j.remote ? "Remote" : j.location})`,
    `${j.badge.label}: ${j.badge.detail}`,
    ...(j.salary ? [`${SALARY_MARK[j.salary.status]}: ${j.salary.text}`] : []),
    ...(j.why ? [`Why it fits: ${j.why}`] : []),
    `Posting: ${j.url}`,
    `Draft my email: ${ask(`Draft a cold email for the ${j.title} role at ${j.company} (job ${j.id})`)}`,
  ].join("\n"));

  const head = d.countdown?.line ?? `Add your visa end date and this email starts with your countdown: ${d.appUrl}/case`;
  const hidden = d.hiddenCount
    ? `${d.hiddenCount} more new job${d.hiddenCount === 1 ? "" : "s"} at licensed sponsors matched you ${period}. You've used the free plan's jobs; Pro shows them all, daily, with a check of each job's pay against the visa salary floor: ${d.appUrl}/upgrade`
    : "";
  const sponsorPage = (s: NewSponsor) => (s.slug ? `${d.appUrl}/sponsors/${s.country === "GB" ? "uk" : "nl"}/${s.slug}` : null);
  const newBlock = fresh.length
    ? [
        `New on the sponsor register. A new licence usually means they're about to hire someone who needs a visa, often before a role is posted:`,
        ...fresh.map((s) => [
          newSponsorLine(s),
          ...(sponsorPage(s) ? [`Register entry: ${sponsorPage(s)}`] : []),
          `Ask Maya who to contact: ${ask(`${s.name} is new on the ${s.country === "GB" ? "UK" : "Dutch"} sponsor register. What do they do, and who should I contact about roles?`)}`,
        ].join("\n")),
      ].join("\n\n")
    : "";
  const upsell = !d.paid && !d.hiddenCount ? `Pro sends these daily and checks each job's posted pay against the visa salary floor: ${d.appUrl}/upgrade` : "";
  const what = n ? `${n} new job${n === 1 ? "" : "s"} at licensed sponsors`
    : d.hiddenCount ? `${d.hiddenCount} new sponsor job${d.hiddenCount === 1 ? "" : "s"} matched you`
    : `${fresh.length} employer${fresh.length === 1 ? "" : "s"} new on the sponsor register`;
  const subject = d.countdown && d.countdown.level !== "expired" ? `${d.countdown.days} days left: ${what}` : n || d.hiddenCount ? `${what} ${period}` : what;

  const text = [
    d.firstName ? `Hi ${d.firstName},` : "Hi,",
    head,
    n ? `New ${period} at employers on the official sponsor registers. Apply in the first few days and email the hiring manager the same day: that's when replies are most likely.` : "",
    blocks.join("\n\n"),
    hidden,
    newBlock,
    upsell,
    `A licence means an employer can sponsor, not that it will for every role. Salary floors also depend on the role and your age; check the source linked in Your case.`,
    `Maya (your AI job buddy at ${d.siteName})`,
    `Don't want these? Unsubscribe: ${d.unsubscribeUrl}`,
  ].filter(Boolean).join("\n\n");
  return { subject, text };
}
