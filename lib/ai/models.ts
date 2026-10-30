import "server-only";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { SITE_NAME } from "@/lib/site";

const openrouter = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY, headers: { "X-Title": SITE_NAME } });

/** Resumes and chats are personal data: only zero-data-retention endpoints, never providers that train on prompts. */
const PRIVATE = { provider: { data_collection: "deny", zdr: true } } as const;

/** Fast + cheap: the conversational turns. */
export const chatModel = () => openrouter.chat(process.env.CHAT_MODEL ?? "anthropic/claude-haiku-5.5", PRIVATE);
/** Stronger: resume parsing/review, cold emails, interview plans, tailoring. */
// Low reasoning effort: long-form outputs otherwise spend their token budget thinking and get cut off.
export const smartModel = () => openrouter.chat(process.env.SMART_MODEL ?? "anthropic/claude-sonnet-5.5", { ...PRIVATE, reasoning: { effort: "low" } });

/**
 * Fast model with OpenRouter web search, for company culture summaries. The search query is only a
 * company name (no personal data), so it may go to the search engine; the prompt stays ZDR-routed.
 */
export const researchModel = () =>
  openrouter.chat(process.env.CHAT_MODEL ?? "anthropic/claude-haiku-5.5", { ...PRIVATE, plugins: [{ id: "web", max_results: 6, engine: "exa" }] });
