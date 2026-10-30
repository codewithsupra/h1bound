import {
  convertToModelMessages,
  createIdGenerator,
  createUIMessageStreamResponse,
  stepCountIs,
  streamText,
  toUIMessageStream,
  validateUIMessages,
  type UIMessage,
} from "ai";
import { trialState } from "@/lib/server/growth";
import { optStatus, optSummary } from "@/lib/opt";
import { NextResponse } from "next/server";
import { chatModel } from "@/lib/ai/models";
import { mayaSystem } from "@/lib/ai/maya";
import { buildTools } from "@/lib/ai/tools";
import { getStore } from "@/lib/server/store";
import { isMarketProfile, MARKET_NAME, workRights, type Market } from "@/lib/visa";

export const maxDuration = 60;

export async function POST(req: Request) {
  const store = await getStore();
  if (!store) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { message } = (await req.json()) as { message: UIMessage };
  if (!message || message.role !== "user") return NextResponse.json({ error: "bad_request" }, { status: 400 });
  if ((await store.messagesToday()) >= store.dailyMessageCap) {
    return NextResponse.json({ error: "daily_cap", message: "We've talked a lot today! Let's pick this up tomorrow." }, { status: 429 });
  }

  const tools = buildTools(store);
  const [history, profile, pro, usage, trial] = await Promise.all([
    store.loadChat(), store.loadProfile(), store.isPro(), store.usage(),
    store.kind === "user" ? trialState(store.id) : null,
  ]);
  const row = profile?.row;
  const opt = profile?.details?.opt;
  const knowsRights = Boolean(row?.citizenship || row?.visa_situation);
  const rights = knowsRights ? workRights({ citizenship: row?.citizenship ?? null, visaCountry: row?.visa_country ?? null, visaSituation: row?.visa_situation ?? null }) : null;
  const RIGHT_TEXT = { free: "free to work", post_study: "can work on a post-study visa, needs a sponsor long term", sponsor: "needs a licensed sponsor" } as const;
  const optNow = opt ? optStatus(opt) : null;

  let messages: UIMessage[];
  try {
    messages = await validateUIMessages({ messages: [...history, message], tools });
  } catch {
    messages = [message]; // stored history no longer matches current tool schemas: start fresh
  }

  const result = streamText({
    model: chatModel(),
    system: mayaSystem({
      firstName: profile?.details?.name?.split(" ")[0] ?? store.firstName,
      guest: store.kind === "guest",
      jobLimit: store.jobLimit,
      onboarded: Boolean(profile?.row.onboarded),
      hasResume: Boolean(profile?.details?.resumeText),
      visaStatus: profile?.row.visa_status ?? null,
      optEndDate: profile?.details?.optEndDate ?? null,
      optClock: opt && optNow ? optSummary(optNow, opt.employed) : null,
      optDaysLeft: optNow?.left ?? null,
      pro,
      trialEndsAt: trial?.active ? trial.endsAt : null,
      trialUsed: trial?.used ?? false,
      usage: { jobsShown: usage.jobsShown, reviewedJobs: usage.reviewedJobIds.length, reviewRounds: usage.reviewRounds },
      today: new Date().toISOString().slice(0, 10),
      market: row ? isMarketProfile(row) : true,
      citizenship: row?.citizenship ?? null,
      visaCountry: row?.visa_country ?? null,
      visaSituation: row?.visa_situation ?? null,
      targetCountries: row?.target_countries ?? [],
      workRights: rights ? Object.entries(rights).map(([m, r]) => `${MARKET_NAME[m as Market]}: ${RIGHT_TEXT[r]}`).join("; ") : null,
      graduation: profile?.details?.graduation ?? null,
    }),
    messages: await convertToModelMessages(messages),
    tools,
    stopWhen: stepCountIs(6),
    maxOutputTokens: 700,
  });
  // Finish (and save) the reply even if the browser disconnects mid-stream.
  result.consumeStream();

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      tools,
      originalMessages: messages,
      generateMessageId: createIdGenerator({ prefix: "msg", size: 16 }),
      onEnd: async ({ messages: all }) => {
        const known = new Set(history.map((m) => m.id));
        await store.saveChat(all, all.filter((m) => !known.has(m.id)));
      },
    }),
  });
}
