import { NextResponse, type NextRequest } from "next/server";
import { isRefCode, REF_COOKIE, REF_MAX_AGE } from "@/lib/server/growth";

/** Invite link: remember who sent it until the friend signs up, then land on the home page. */
export async function GET(request: NextRequest, ctx: RouteContext<"/r/[code]">) {
  const { code } = await ctx.params;
  const res = NextResponse.redirect(new URL("/?invited=1", request.url));
  if (isRefCode(code)) {
    res.cookies.set(REF_COOKIE, code, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: REF_MAX_AGE });
  }
  return res;
}
