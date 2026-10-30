/**
 * Company culture summaries built from public web sources (company site, news, Reddit, public
 * review snippets). Never scraped from Glassdoor: we link people there instead. Pure helpers here;
 * fetching and caching live in lib/server/insight.ts.
 */

export type Insight = {
  summary: string;
  pros: string[];
  cons: string[];
  interviews: string | null;
  sources: { title: string; url: string }[];
};

const clip = (s: unknown, words: number) => (typeof s === "string" ? s.trim().split(/\s+/).slice(0, words).join(" ") : "");

function safeUrl(u: unknown): string | null {
  if (typeof u !== "string") return null;
  try {
    const url = new URL(u.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Parses the model's JSON reply (tolerating a code fence or stray text around it) and merges in the
 * URLs the search plugin actually cited. Returns null when there's nothing usable, or no sources:
 * a summary nobody can check isn't shown.
 */
export function parseInsight(text: string, cited: { title?: string; url: string }[] = []): Insight | null {
  const body = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(body) as Record<string, unknown>;
  } catch {
    return null;
  }
  const summary = clip(raw.summary, 90);
  if (!summary) return null;
  const list = (v: unknown) => (Array.isArray(v) ? v.map((x) => clip(x, 22)).filter(Boolean).slice(0, 4) : []);
  const seen = new Set<string>();
  const sources: Insight["sources"] = [];
  for (const s of [...(Array.isArray(raw.sources) ? raw.sources : []), ...cited] as { title?: unknown; url?: unknown }[]) {
    const url = safeUrl(s?.url);
    if (!url || seen.has(url) || /glassdoor\./i.test(url)) continue;
    seen.add(url);
    sources.push({ title: clip(s.title, 12) || new URL(url).hostname.replace(/^www\./, ""), url });
  }
  if (!sources.length) return null;
  return { summary, pros: list(raw.pros), cons: list(raw.cons), interviews: clip(raw.interviews, 50) || null, sources: sources.slice(0, 6) };
}

/** Glassdoor search for the company: we link to reviews, never copy them. */
export const glassdoorLink = (company: string, country: string | null) =>
  `https://www.glassdoor.${country === "GB" ? "co.uk" : country === "NL" ? "nl" : country === "IE" ? "ie" : "com"}/Search/results.htm?keyword=${encodeURIComponent(company)}`;
