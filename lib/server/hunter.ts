import "server-only";
import type { TitleFamily } from "@/lib/titles";

/**
 * Finds a likely hiring manager / engineering leader via Hunter.io (Pro only, hard-capped by the
 * free tier's 25 searches/month). Without a key we return null and Maya suggests a LinkedIn search.
 */

export type Contact = { name: string; title: string | null; email: string; confidence: number; source: "hunter" };

type HunterEmail = { value: string; first_name: string | null; last_name: string | null; position: string | null; confidence: number; department: string | null; seniority: string | null };

const FOUNDER = /\b(co-?founder|founder|ceo|chief executive|managing director)\b/i;
const TECH = [/\b(cto|chief technology)\b/i, /\bvp\b.*\b(engineering|technology)\b/i, /\b(head|director)\b.*\b(engineering|data|ml|ai|technology|platform)\b/i, /\b(engineering|software|data) manager\b/i];
const LEADERS: Partial<Record<TitleFamily, RegExp[]>> = {
  product_manager: [/\b(cpo|chief product)\b/i, /\b(vp|head|director)\b.*\bproduct\b/i, /\bproduct (lead|manager)\b/i],
  designer: [/\b(head|director|vp)\b.*\bdesign\b/i, /\bdesign (lead|manager)\b/i],
  finance: [/\b(cfo|chief financial)\b/i, /\b(finance director|head of finance|financial controller|vp finance)\b/i, /\bfinance manager\b/i],
  consulting: [/\b(partner|principal)\b/i, /\b(director|head)\b/i, /\b(engagement|practice) manager\b/i],
  business_analyst: [/\b(coo|chief operating)\b/i, /\b(head|director)\b.*\b(operations|strategy|analytics|business)\b/i, /\b(analytics|operations) manager\b/i],
  healthcare: [/\b(medical|clinical) director\b/i, /\bhead of\b/i, /\b(practice|service) manager\b/i],
  research: [/\b(head|director)\b.*\bresearch\b/i, /\b(principal|lead) (scientist|researcher)\b/i],
  engineering: [/\b(engineering|technical) director\b/i, /\bhead of engineering\b/i, /\b(engineering|project) manager\b/i],
  hardware: [/\b(engineering|hardware) director\b/i, /\bhead of (hardware|engineering)\b/i, /\bengineering manager\b/i],
};
const RECRUITER = /\b(technical |graduate |early careers? )?(recruit|talent)/i;

/**
 * The person most likely to read and answer a candidate's email: a founder at a small company
 * (they hire directly), otherwise the leader of the team the role sits in, then recruiters.
 */
export function pickContact(emails: HunterEmail[], opts: { family?: TitleFamily; small?: boolean; preferRecruiter?: boolean } = {}): Contact | null {
  const named = emails.filter((e) => e.first_name && e.last_name && e.confidence >= 50);
  const team = (opts.family && LEADERS[opts.family]) || TECH;
  const order = opts.preferRecruiter ? [RECRUITER, ...team] : [...(opts.small ? [FOUNDER] : []), ...team, ...(opts.small ? [] : [FOUNDER]), RECRUITER];
  for (const re of order) {
    const hit = named.filter((e) => e.position && re.test(e.position)).sort((a, b) => b.confidence - a.confidence)[0];
    if (hit) return { name: `${hit.first_name} ${hit.last_name}`, title: hit.position, email: hit.value, confidence: hit.confidence, source: "hunter" };
  }
  return null;
}

/** "11-50" → 50; "1001-5000" → 5000; unknown → null. */
export function headcountMax(h: string | null | undefined): number | null {
  const m = h?.match(/(\d[\d,]*)\s*\+?$/);
  return m ? Number(m[1].replace(/,/g, "")) : null;
}

export async function findContact(company: string, family?: TitleFamily): Promise<Contact | null> {
  const key = process.env.HUNTER_API_KEY;
  if (!key) return null;
  const url = `https://api.hunter.io/v2/domain-search?company=${encodeURIComponent(company)}&type=personal&limit=25`;
  const res = await fetch(url, { headers: { "X-API-KEY": key }, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) return null;
  const body = (await res.json()) as { data?: { emails?: HunterEmail[]; headcount?: string | null } };
  const size = headcountMax(body.data?.headcount);
  return pickContact(body.data?.emails ?? [], { family, small: size !== null && size <= 50 });
}

export const linkedInSearch = (company: string, role: string) =>
  `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(`${company} ${role}`)}`;
