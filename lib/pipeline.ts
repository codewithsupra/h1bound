/**
 * The signed-in pipeline: what each job needs from the student next, how rows group into the
 * board's sections, and the student's own reply numbers. Pure and client-safe.
 */
import type { LicenceProof } from "@/lib/visa";

export type MatchStatus = "shown" | "saved" | "applied" | "emailed" | "replied" | "interview" | "offer" | "rejected" | "dismissed";

/** Board columns. Rejected and dismissed both land in "closed". */
export type Stage = "picked" | "emailed" | "replied" | "interview" | "offer" | "closed";
export const STAGES: Stage[] = ["picked", "emailed", "replied", "interview", "offer", "closed"];
export const STAGE_LABEL: Record<Stage, string> = {
  picked: "Picked", emailed: "Emailed", replied: "Replied", interview: "Interview", offer: "Offer", closed: "Closed",
};
/** The status written when a row is moved to a stage. */
export const STAGE_STATUS: Record<Stage, MatchStatus> = {
  picked: "saved", emailed: "emailed", replied: "replied", interview: "interview", offer: "offer", closed: "dismissed",
};

export function stageOf(status: MatchStatus): Stage {
  if (status === "shown" || status === "saved" || status === "applied") return "picked";
  if (status === "rejected" || status === "dismissed") return "closed";
  return status;
}

export type PipelineRow = {
  jobId: string;
  title: string;
  company: string;
  location: string;
  country: string | null;
  remote: boolean;
  url: string;
  score: number;
  why: string | null;
  status: MatchStatus;
  statusAt: string;
  shownAt: string;
  licence: LicenceProof | null;
  contact: { name: string | null; role: string | null; email: string | null } | null;
  /** The latest cold email Maya drafted for this job, and its follow-up. */
  draft: { outreachId: string; followUpId: string | null; sentAt: string | null; followUpSentAt: string | null } | null;
  askedReplyAt: string | null;
  hasNote: boolean;
};

export type NextAction = "draft_ready" | "follow_up" | "ask_reply" | "respond" | "prep" | "write" | "waiting" | "none";

export const NEXT_LABEL: Record<NextAction, string> = {
  draft_ready: "DRAFT READY",
  follow_up: "FOLLOW UP",
  ask_reply: "ANY REPLY?",
  respond: "REPLY BACK",
  prep: "PREP",
  write: "DRAFT IT",
  waiting: "AWAITING",
  none: "—",
};

const DAY = 86_400_000;
export const FOLLOW_UP_DAYS = 4;
export const ASK_REPLY_DAYS = 7;

const daysSince = (iso: string | null, now: number) => (iso ? (now - Date.parse(iso)) / DAY : Infinity);

export function nextAction(r: Pick<PipelineRow, "status" | "statusAt" | "draft" | "askedReplyAt">, now: number): NextAction {
  const stage = stageOf(r.status);
  if (stage === "closed" || stage === "offer") return "none";
  if (stage === "interview") return "prep";
  if (stage === "replied") return "respond";
  const sentAt = r.draft?.sentAt ?? null;
  if (sentAt) {
    const since = daysSince(sentAt, now);
    if (r.draft?.followUpId && !r.draft.followUpSentAt && since >= FOLLOW_UP_DAYS) return "follow_up";
    return since >= ASK_REPLY_DAYS && daysSince(r.askedReplyAt, now) >= ASK_REPLY_DAYS ? "ask_reply" : "waiting";
  }
  // Marked as emailed by hand: no tracked send, so check in a week after it was marked.
  if (stage === "emailed") return daysSince(r.statusAt, now) >= ASK_REPLY_DAYS && daysSince(r.askedReplyAt, now) >= ASK_REPLY_DAYS ? "ask_reply" : "waiting";
  return r.draft ? "draft_ready" : "write";
}

export type Group = "needs_you" | "new" | "waiting" | "interviewing" | "closed";
export const GROUPS: Group[] = ["needs_you", "new", "waiting", "interviewing", "closed"];
export const GROUP_LABEL: Record<Group, string> = {
  needs_you: "Needs you", new: "New picks", waiting: "Waiting on a reply", interviewing: "Interviews and offers", closed: "Closed",
};

export function groupOf(r: PipelineRow, now: number): Group {
  const stage = stageOf(r.status);
  if (stage === "closed") return "closed";
  if (stage === "interview" || stage === "offer") return "interviewing";
  const next = nextAction(r, now);
  if (next === "draft_ready" || next === "follow_up" || next === "ask_reply" || next === "respond") return "needs_you";
  if (next === "write") return "new";
  return "waiting";
}

export type Tab = "all" | "needs_you" | "waiting" | "interviewing" | "closed";
export const TABS: Tab[] = ["all", "needs_you", "waiting", "interviewing", "closed"];
export const TAB_LABEL: Record<Tab, string> = { all: "All", needs_you: "Needs you", waiting: "Waiting", interviewing: "Interviews", closed: "Closed" };

export function inTab(g: Group, tab: Tab): boolean {
  if (tab === "all") return g !== "closed";
  return g === tab;
}

export function tabCounts(rows: PipelineRow[], now: number): Record<Tab, number> {
  const out: Record<Tab, number> = { all: 0, needs_you: 0, waiting: 0, interviewing: 0, closed: 0 };
  for (const r of rows) {
    const g = groupOf(r, now);
    for (const t of TABS) if (inTab(g, t)) out[t]++;
  }
  return out;
}

/** Can this employer sponsor, on the official record? Ireland needs a permit history; UK B-rated doesn't count. */
export function canSponsor(l: LicenceProof | null): boolean {
  if (!l) return false;
  if (l.country === "GB") return l.rating !== "B";
  if (l.country === "IE") return Object.values(l.permits).some((n) => n > 0);
  return true;
}

/**
 * Rows by group, best first. When the visa clock is urgent, employers that can sponsor go first,
 * since only they can keep the student in the country once the post-study visa ends.
 */
export function groupRows(rows: PipelineRow[], now: number, urgent: boolean): Record<Group, PipelineRow[]> {
  const out = Object.fromEntries(GROUPS.map((g) => [g, [] as PipelineRow[]])) as Record<Group, PipelineRow[]>;
  for (const r of rows) out[groupOf(r, now)].push(r);
  for (const g of GROUPS) {
    out[g].sort((a, b) =>
      (urgent ? Number(canSponsor(b.licence)) - Number(canSponsor(a.licence)) : 0)
      || (g === "new" ? b.score - a.score : 0)
      || Date.parse(b.statusAt) - Date.parse(a.statusAt),
    );
  }
  return out;
}

export type VisaUrgency = { days: number; level: "calm" | "soon" | "urgent" | "expired" };

/** Days left on a student / post-study visa. Under 90 days, sponsors go first. */
export function visaUrgency(endsOn: string | null | undefined, now: number): VisaUrgency | null {
  if (!endsOn || !/^\d{4}-\d{2}-\d{2}$/.test(endsOn)) return null;
  const days = Math.ceil((Date.parse(`${endsOn}T23:59:59Z`) - now) / DAY);
  if (Number.isNaN(days)) return null;
  return { days: Math.max(0, days), level: days <= 0 ? "expired" : days < 90 ? "urgent" : days < 180 ? "soon" : "calm" };
}

export type ReplyStats = { sent: number; replied: number; interviews: number; rate: number; show: boolean };
export const MIN_SENT_FOR_STATS = 5;
const CONTACTED: MatchStatus[] = ["emailed", "replied", "interview", "offer", "rejected"];

/** The student's own numbers, from emails we tracked. Nothing estimated; hidden until there's enough to mean something. */
export function replyStats(rows: Pick<PipelineRow, "status" | "draft">[]): ReplyStats {
  const sent = rows.filter((r) => r.draft?.sentAt || CONTACTED.includes(r.status));
  const replied = sent.filter((r) => ["replied", "interview", "offer"].includes(r.status)).length;
  const interviews = sent.filter((r) => r.status === "interview" || r.status === "offer").length;
  return { sent: sent.length, replied, interviews, rate: sent.length ? Math.round((replied / sent.length) * 100) : 0, show: sent.length >= MIN_SENT_FOR_STATS };
}

export type CaseInput = {
  resume: boolean;
  citizenship: string | null;
  visaSituation: string | null;
  visaEndsOn: string | null;
  links: number;
  pitch: string | null;
  targetCountries: number;
};

export type CaseItem = { key: string; label: string; done: boolean; hint: string };

/** How well Maya can argue for this student. Each item makes emails and matches sharper. */
export function caseStrength(c: CaseInput): { items: CaseItem[]; done: number; total: number } {
  const needsEnd = c.visaSituation === "student" || c.visaSituation === "graduate";
  const items: CaseItem[] = [
    { key: "resume", label: "Resume read", done: c.resume, hint: "Maya matches on what's in it." },
    { key: "rights", label: "Work rights set", done: Boolean(c.citizenship && c.visaSituation), hint: "Decides which employers can hire you." },
    { key: "visa_end", label: "Visa end date", done: !needsEnd || Boolean(c.visaEndsOn), hint: "Starts your visa clock." },
    { key: "countries", label: "Target countries", done: c.targetCountries > 0, hint: "UK, Netherlands, Ireland or remote." },
    { key: "pitch", label: "One-line pitch", done: Boolean(c.pitch && c.pitch.trim().length >= 20), hint: "Opens every email." },
    { key: "links", label: "Your links", done: c.links > 0, hint: "GitHub, portfolio or LinkedIn." },
  ];
  return { items, done: items.filter((i) => i.done).length, total: items.length };
}
