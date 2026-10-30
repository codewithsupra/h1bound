/**
 * How many daily picks someone gets today. Pure and tested. Pro (and the trial) get 3; free users
 * get 1 a day while their free allowance lasts, so picks never silently burn the whole quota.
 */

export const PRO_PICKS = 3;
const HOURS_BETWEEN = 20;

export function picksToday(s: { pro: boolean; jobsShown: number; jobLimit: number; lastPickAt: number | null; now: number }): number {
  if (s.lastPickAt && s.now - s.lastPickAt < HOURS_BETWEEN * 3_600_000) return 0;
  if (s.pro) return PRO_PICKS;
  return s.jobsShown < s.jobLimit ? 1 : 0;
}

/** Plain-text email for the same picks (the Telegram version is lib/telegram.ts pickMessage). */
export function picksEmail(
  firstName: string | null,
  picks: { id: string; title: string; company: string; location: string; remote: boolean; url: string; badge: { label: string; detail: string }; why?: string | null }[],
  appUrl: string,
  siteName: string,
  unsubscribeUrl: string,
) {
  const ask = (q: string) => `${appUrl}/chat?ask=${encodeURIComponent(q)}`;
  const blocks = picks.map((p) => [
    `${p.title} at ${p.company} (${p.remote ? "Remote" : p.location})`,
    `${p.badge.label}: ${p.badge.detail}`,
    ...(p.why ? [`Why it fits: ${p.why}`] : []),
    `Posting: ${p.url}`,
    `Draft my email: ${ask(`Draft a cold email for the ${p.title} role at ${p.company} (job ${p.id})`)}`,
  ].join("\n"));
  return {
    subject: picks.length === 1 ? `Today's pick: ${picks[0].title} at ${picks[0].company}` : `Your ${picks.length} picks for today`,
    text: `${firstName ? `Morning ${firstName},` : "Morning,"}\n\nApply in the first few days and email the hiring manager the same day: that's when replies are most likely.\n\n${blocks.join("\n\n")}\n\nMaya (your AI job buddy at ${siteName})\n\nDon't want these? Unsubscribe: ${unsubscribeUrl}`,
  };
}
