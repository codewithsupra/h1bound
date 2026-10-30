import "server-only";
import { generateText, Output } from "ai";
import { z } from "zod";
import { chatModel } from "@/lib/ai/models";
import { cleanRerank, type RerankVerdict } from "@/lib/match";

/**
 * Second-pass ranking: a fast model reads the candidate's resume against the top deterministic
 * matches and judges real fit (skills depth, level, domain), which keyword overlap can't. Best
 * effort: any failure or timeout keeps the deterministic order.
 */

export type RerankJob = { id: string; title: string; company: string; location: string; description: string };

const schema = z.object({
  verdicts: z.array(z.object({
    n: z.number().describe("The job's number from the list"),
    fit: z.number().describe("0-100: how well this candidate fits this job and is likely to get a reply"),
    why: z.string().describe("One short sentence, max 20 words, naming the candidate's specific matching experience"),
    gap: z.string().nullable().describe("The biggest gap in max 12 words, or null"),
  })),
});

export async function rerank(resume: string, prefs: string, jobs: RerankJob[], timeoutMs = 12_000): Promise<Map<string, RerankVerdict>> {
  if (!resume.trim() || jobs.length < 2) return new Map();
  const list = jobs.map((j, i) => `#${i + 1} ${j.title} at ${j.company} (${j.location})\n${j.description.replace(/\s+/g, " ").slice(0, 900)}`).join("\n\n");
  try {
    const { output } = await generateText({
      model: chatModel(),
      output: Output.object({ schema }),
      abortSignal: AbortSignal.timeout(timeoutMs),
      system:
        "You are a strict technical recruiter. Judge each job for THIS candidate: required skills they actually have (from the resume, not guesses), seniority match (penalize roles needing far more experience), domain fit, and preferences. Only cite experience the resume shows. Be calibrated: most jobs are 40-75; reserve 85+ for near-perfect fits.",
      prompt: `CANDIDATE PREFERENCES: ${prefs}\n\nRESUME:\n${resume.slice(0, 6000)}\n\nJOBS:\n${list}\n\nReturn one verdict per job.`,
    });
    return cleanRerank(output.verdicts, jobs.map((j) => j.id));
  } catch {
    return new Map();
  }
}
