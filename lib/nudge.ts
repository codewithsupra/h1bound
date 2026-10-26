/**
 * Decides which (if any) email Maya sends a user today. Pure + tested. Useful first, selling
 * second: follow-ups and new jobs beat upgrade asks, and an upgrade ask goes out at most once.
 */

export type NudgeKind = "follow_up" | "new_jobs" | "upgrade";

export type NudgeState = {
  consented: boolean;
  pro: boolean;
  now: number;
  sentAt: number[]; // timestamps of previous nudges (ms)
  sentKinds: NudgeKind[];
  staleApplications: number; // applied/emailed ≥5 days ago with no newer status
  newMatchingJobs: number; // fresh jobs in their families since the last nudge
  freeLimitHit: boolean;
};

const DAY = 86_400_000;
export const MAX_PER_WEEK = 3;
export const MIN_GAP_DAYS = 2;

export function chooseNudge(s: NudgeState): NudgeKind | null {
  if (!s.consented) return null;
  const lastWeek = s.sentAt.filter((t) => s.now - t < 7 * DAY);
  if (lastWeek.length >= MAX_PER_WEEK) return null;
  if (s.sentAt.some((t) => s.now - t < MIN_GAP_DAYS * DAY)) return null;
  if (s.staleApplications > 0) return "follow_up";
  if (s.newMatchingJobs >= 3) return "new_jobs";
  if (!s.pro && s.freeLimitHit && !s.sentKinds.includes("upgrade")) return "upgrade";
  return null;
}

export function nudgeCopy(kind: NudgeKind, firstName: string | null, n: { stale: number; jobs: number }, appUrl: string, unsubscribeUrl: string) {
  const hi = firstName ? `Hey ${firstName},` : "Hey,";
  const sign = `\n\nMaya (your AI job buddy at H1Bound)\n\nDon't want these? Unsubscribe: ${unsubscribeUrl}`;
  switch (kind) {
    case "follow_up":
      return {
        subject: n.stale === 1 ? "Did they get back to you?" : `Any news on those ${n.stale} applications?`,
        text: `${hi}\n\nIt's been about a week since you reached out. A short, friendly follow-up doubles your odds of a reply. Want me to draft one? Just say "follow up" in our chat: ${appUrl}/chat${sign}`,
      };
    case "new_jobs":
      return {
        subject: `${n.jobs} new jobs at companies that sponsor`,
        text: `${hi}\n\n${n.jobs} new openings that fit your profile went up at employers with H-1B filing history. They tend to fill fast. Take a look: ${appUrl}/chat${sign}`,
      };
    case "upgrade":
      return {
        subject: "You've used your 10 free matches",
        text: `${hi}\n\nYou've seen all your free matches. If you want to keep going, Pro gives you unlimited matches every morning, plus I'll find the hiring manager and draft the cold email for you. ${appUrl}/upgrade\n\nNo pressure: your free account stays, and so does everything we've done so far.${sign}`,
      };
  }
}
