import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/insforge/server";
import { checkState, connectGmail, GMAIL_STATE_COOKIE } from "@/lib/server/gmail";

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  const back = (status: string) => {
    const res = NextResponse.redirect(new URL(`/chat?gmail=${status}`, req.url));
    res.cookies.delete({ name: GMAIL_STATE_COOKIE, path: "/api/gmail" });
    return res;
  };
  if (!user) return NextResponse.redirect(new URL("/login?next=/chat", req.url));
  const p = req.nextUrl.searchParams;
  if (p.get("error")) return back("cancelled");
  if (!checkState(p.get("state"), req.cookies.get(GMAIL_STATE_COOKIE)?.value, user.id)) return back("failed");
  try {
    await connectGmail(user.id, p.get("code") ?? "");
    return back("connected");
  } catch {
    return back("failed");
  }
}
