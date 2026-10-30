import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/insforge/server";
import { gmailAccount, gmailConfigured } from "@/lib/server/gmail";

/** Whether the signed-in user has Gmail connected (never returns the address or token). */
export async function GET() {
  const user = await getSessionUser();
  if (!user || !gmailConfigured()) return NextResponse.json({ gmail: "unavailable" });
  return NextResponse.json({ gmail: (await gmailAccount(user.id).catch(() => null)) ? "connected" : "not_connected" });
}
