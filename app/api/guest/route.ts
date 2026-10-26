import { NextResponse } from "next/server";
import { getStore, startGuest } from "@/lib/server/store";

/** GET: who is chatting (user / guest / nobody) plus their saved history. */
export async function GET() {
  const store = await getStore();
  if (!store) return NextResponse.json({ kind: null, messages: [] });
  const [messages, usage] = await Promise.all([store.loadChat(), store.usage()]);
  return NextResponse.json({ kind: store.kind, messages, jobsShown: usage.jobsShown, jobLimit: store.jobLimit });
}

/** POST: start a guest session (no signup). 429 when this network already started too many today. */
export async function POST() {
  const store = await startGuest();
  if (!store) return NextResponse.json({ error: "guest_limit", message: "Lots of people tried Maya from this network today. Create a free account to keep going." }, { status: 429 });
  return NextResponse.json({ kind: store.kind, messages: await store.loadChat() });
}
