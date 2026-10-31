import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/insforge/server";
import { authUrl, GMAIL_STATE_COOKIE, gmailConfigured, newState } from "@/lib/server/gmail";

/** Starts Google OAuth for gmail.send. Signed-in users only. */
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.redirect(new URL("/login?next=/chat", req.url));
  if (!gmailConfigured()) return NextResponse.redirect(new URL("/settings?gmail=unavailable", req.url));
  const state = newState(user.id);
  const res = NextResponse.redirect(authUrl(state));
  res.cookies.set(GMAIL_STATE_COOKIE, state, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/api/gmail", maxAge: 600 });
  return res;
}
