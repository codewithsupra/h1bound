import "server-only";

/**
 * Finds a likely hiring manager / engineering leader via Hunter.io (Pro only, hard-capped by the
 * free tier's 25 searches/month). Without a key we return null and Maya suggests a LinkedIn search.
 */

export type Contact = { name: string; title: string | null; email: string; confidence: number; source: "hunter" };

type HunterEmail = { value: string; first_name: string | null; last_name: string | null; position: string | null; confidence: number; department: string | null; seniority: string | null };

const RANK = [/\b(cto|chief technology)\b/i, /\bvp\b.*\b(engineering|technology)\b/i, /\b(head|director)\b.*\b(engineering|data|ml|ai|product|technology)\b/i, /\b(engineering|software) manager\b/i, /\b(technical )?recruit|talent/i];

export function pickContact(emails: HunterEmail[], preferRecruiter = false): Contact | null {
  const named = emails.filter((e) => e.first_name && e.last_name && e.confidence >= 50);
  const order = preferRecruiter ? [RANK[4], ...RANK.slice(0, 4)] : RANK;
  for (const re of order) {
    const hit = named.filter((e) => e.position && re.test(e.position)).sort((a, b) => b.confidence - a.confidence)[0];
    if (hit) return { name: `${hit.first_name} ${hit.last_name}`, title: hit.position, email: hit.value, confidence: hit.confidence, source: "hunter" };
  }
  return null;
}

export async function findContact(company: string): Promise<Contact | null> {
  const key = process.env.HUNTER_API_KEY;
  if (!key) return null;
  const url = `https://api.hunter.io/v2/domain-search?company=${encodeURIComponent(company)}&type=personal&limit=25`;
  const res = await fetch(url, { headers: { "X-API-KEY": key }, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) return null;
  const body = (await res.json()) as { data?: { emails?: HunterEmail[] } };
  return pickContact(body.data?.emails ?? []);
}

export const linkedInSearch = (company: string, role: string) =>
  `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(`${company} ${role}`)}`;
