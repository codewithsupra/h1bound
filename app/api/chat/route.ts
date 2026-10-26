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
import { NextResponse } from "next/server";
import { chatModel } from "@/lib/ai/models";
import { mayaSystem } from "@/lib/ai/maya";
import { buildTools } from "@/lib/ai/tools";
import { getStore } from "@/lib/server/store";

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
  const [history, profile, pro, usage] = await Promise.all([store.loadChat(), store.loadProfile(), store.isPro(), store.usage()]);

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
      hasResume: Boolean(profile?.details),
      visaStatus: profile?.row.visa_status ?? null,
      optEndDate: profile?.details?.optEndDate ?? null,
      pro,
      usage: { jobsShown: usage.jobsShown, reviewedJobs: usage.reviewedJobIds.length, reviewRounds: usage.reviewRounds },
      today: new Date().toISOString().slice(0, 10),
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
