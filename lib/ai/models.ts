import "server-only";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";

const openrouter = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY, headers: { "X-Title": "H1Bound" } });

/** Resumes and chats are personal data: only zero-data-retention endpoints, never providers that train on prompts. */
const PRIVATE = { provider: { data_collection: "deny", zdr: true } } as const;

/** Fast + cheap: the conversational turns. */
export const chatModel = () => openrouter.chat(process.env.CHAT_MODEL ?? "anthropic/claude-haiku-5.5", PRIVATE);
/** Stronger: resume parsing/review, cold emails, interview plans, tailoring. */
// Low reasoning effort: long-form outputs otherwise spend their token budget thinking and get cut off.
export const smartModel = () => openrouter.chat(process.env.SMART_MODEL ?? "anthropic/claude-sonnet-5.5", { ...PRIVATE, reasoning: { effort: "low" } });
