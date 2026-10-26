/**
 * Free vs Pro limits. Single source of truth for the paywall; the SQL quota function mirrors
 * these numbers and tests/quota.test.ts keeps them in sync.
 *
 * Free: 10 matched jobs ever, resume review on up to 5 of those jobs, 15 review rounds total.
 * Pro: unlimited matches + reviews, plus cold email, interview plan and tailoring.
 */

export const FREE_LIMITS = { jobs: 10, reviewedJobs: 5, reviewRounds: 15 } as const;

export const PRO_FEATURES = ["cold_email", "interview_plan", "tailoring", "unlimited_jobs", "follow_ups"] as const;
export type ProFeature = (typeof PRO_FEATURES)[number];

export type Usage = { jobsShown: number; reviewedJobIds: string[]; reviewRounds: number };

export type Decision = { ok: true; remaining: number | null } | { ok: false; reason: "jobs" | "reviewed_jobs" | "review_rounds" | "pro_only" };

/** How many more jobs a user may be shown right now (null = unlimited). */
export function jobsAllowance(usage: Usage, isPro: boolean): number | null {
  return isPro ? null : Math.max(0, FREE_LIMITS.jobs - usage.jobsShown);
}

export function canShowJobs(usage: Usage, isPro: boolean, wanted: number): { show: number; blocked: number } {
  const allow = jobsAllowance(usage, isPro);
  const show = allow === null ? wanted : Math.min(wanted, allow);
  return { show, blocked: wanted - show };
}

export function canReview(usage: Usage, isPro: boolean, jobId: string): Decision {
  if (isPro) return { ok: true, remaining: null };
  if (usage.reviewRounds >= FREE_LIMITS.reviewRounds) return { ok: false, reason: "review_rounds" };
  const already = usage.reviewedJobIds.includes(jobId);
  if (!already && usage.reviewedJobIds.length >= FREE_LIMITS.reviewedJobs) return { ok: false, reason: "reviewed_jobs" };
  return { ok: true, remaining: FREE_LIMITS.reviewRounds - usage.reviewRounds - 1 };
}

export function canUse(feature: ProFeature, isPro: boolean): Decision {
  return isPro ? { ok: true, remaining: null } : { ok: false, reason: "pro_only" };
}

/** Friendly, non-pushy upsell line Maya can say when a limit is hit. */
export function upsellLine(reason: Exclude<Decision, { ok: true }>["reason"]): string {
  switch (reason) {
    case "jobs":
      return "You've seen all 10 of your free matches. Pro unlocks unlimited matches and new sponsor jobs every morning.";
    case "reviewed_jobs":
      return "Free covers resume reviews for 5 jobs, and you've used them. Pro gives unlimited reviews plus a tailored resume per job.";
    case "review_rounds":
      return "That was your 15th free review round. Pro keeps the reviews coming, with no cap.";
    case "pro_only":
      return "That one's a Pro feature: I'd find the hiring manager, draft the cold email, and build your interview plan.";
  }
}
