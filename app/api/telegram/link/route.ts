import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/insforge/server";
import { linkUrl, telegramConfigured } from "@/lib/server/telegram";

/** "Connect Telegram": sends the signed-in user to the bot with a one-time link token. */
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.redirect(new URL("/login?next=/settings", req.url));
  if (!telegramConfigured()) return NextResponse.redirect(new URL("/settings?telegram=unavailable", req.url));
  return NextResponse.redirect(await linkUrl(user.id));
}
