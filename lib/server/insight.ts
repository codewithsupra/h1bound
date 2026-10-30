import "server-only";
import { generateText, Output } from "ai";
import { z } from "zod";
import { createAdminInsForge } from "@/lib/insforge/admin";
import { chatModel, researchModel } from "@/lib/ai/models";
import { licenceKey } from "@/lib/ingest/registers";
import { parseInsight, type Insight } from "@/lib/insight";

const db = () => createAdminInsForge().database;
const FRESH_DAYS = 30;
/** Web-search calls cost money; a runaway loop or abuse can't spend more than this per day. */
export const DAILY_RESEARCH_CAP = 150;

const RESEARCH = (company: string, where: string) => `Research the company "${company}"${where ? ` (${where})` : ""} for an international graduate deciding whether to apply.
Write short research notes (max 250 words) from the search results only: what the company does, work culture and team life, pace and work-life balance, how they treat junior hires and international staff, and their interview process. Note mixed opinions honestly. Leave out anything from Glassdoor (ratings, percentages, quotes): we link to it separately. Do not invent ratings, numbers or quotes.`;

const shape = z.object({
  summary: z.string().describe("2-3 sentences, max 70 words"),
  pros: z.array(z.string()).describe("Up to 4 things people like, max 15 words each"),
  cons: z.array(z.string()).describe("Up to 4 things to watch out for, max 15 words each"),
  interviews: z.string().nullable().describe("The interview process in max 40 words, or null if the notes don't say"),
});

export type InsightResult = { insight: Insight; cached: boolean } | { error: "not_found" | "busy" };

export async function companyInsight(company: string, where = ""): Promise<InsightResult> {
  const key = licenceKey(company);
  if (!key) return { error: "not_found" };
  const since = new Date(Date.now() - FRESH_DAYS * 86_400_000).toISOString();
  const { data: hit } = await db().from("company_insights").select("insight").eq("key", key).gte("fetched_at", since).maybeSingle();
  if (hit) return { insight: (hit as { insight: Insight }).insight, cached: true };

  const today = new Date(new Date().toISOString().slice(0, 10)).toISOString();
  const { count } = await db().from("company_insights").select("key", { count: "exact", head: true }).gte("fetched_at", today);
  if ((count ?? 0) >= DAILY_RESEARCH_CAP) return { error: "busy" };

  // Step 1: research with web search, as free notes (models ignore length limits here, so no JSON yet).
  const research = await generateText({ model: researchModel(), prompt: RESEARCH(company, where), maxOutputTokens: 1600, abortSignal: AbortSignal.timeout(40_000) });
  const cited = research.sources.flatMap((s) => (s.sourceType === "url" ? [{ title: s.title, url: s.url }] : []));
  if (!research.text.trim() || !cited.length) return { error: "not_found" };
  // Step 2: structure the notes. Limits are enforced again in parseInsight (no zod .max(): see CLAUDE.md).
  const { output } = await generateText({
    model: chatModel(),
    output: Output.object({ schema: shape }),
    abortSignal: AbortSignal.timeout(20_000),
    prompt: `Turn these research notes about ${company} into the requested fields. Use only what the notes say; drop markdown links, and leave out any rating, percentage or quote attributed to Glassdoor.\n\nNOTES:\n${research.text.slice(0, 6000)}`,
  });
  const insight = parseInsight(JSON.stringify(output), cited);
  if (!insight) return { error: "not_found" };
  await db().from("company_insights").upsert({ key, name: company, insight, fetched_at: new Date().toISOString() }, { onConflict: "key" });
  return { insight, cached: false };
}
