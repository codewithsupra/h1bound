import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { createAuthActions } from "@insforge/sdk/ssr";
import { GUEST_COOKIE } from "@/lib/server/guest-cookie";
import { claimGuest } from "@/lib/server/store";
import { loadProfile } from "@/lib/server/profile";
import { claimReferral, REF_COOKIE } from "@/lib/server/growth";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("insforge_code");
  if (request.nextUrl.searchParams.get("error") || !code) return NextResponse.redirect(new URL("/login?error=oauth_failed", request.url));
  const codeVerifier = (await cookies()).get("insforge_code_verifier")?.value;
  if (!codeVerifier) return NextResponse.redirect(new URL("/login?error=missing_verifier", request.url));

  const response = NextResponse.redirect(new URL("/pipeline", request.url));
  const auth = createAuthActions({ requestCookies: request.cookies, responseCookies: response.cookies });
  const { data, error } = await auth.exchangeOAuthCode(code, codeVerifier);
  if (error || !data?.user) return NextResponse.redirect(new URL("/login?error=exchange_failed", request.url));
  response.cookies.delete("insforge_code_verifier");
  // OAuth doesn't say whether the account is new; no profile row yet is the best signal.
  const fresh = !(await loadProfile(data.user.id));
  await claimGuest(data.user.id);
  response.cookies.delete(GUEST_COOKIE);
  if (fresh) await claimReferral(data.user.id, request.cookies.get(REF_COOKIE)?.value);
  response.cookies.delete(REF_COOKIE);
  return response;
}
