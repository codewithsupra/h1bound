import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { createAuthActions } from "@insforge/sdk/ssr";
import { GUEST_COOKIE } from "@/lib/server/guest-cookie";
import { claimGuest } from "@/lib/server/store";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("insforge_code");
  if (request.nextUrl.searchParams.get("error") || !code) return NextResponse.redirect(new URL("/login?error=oauth_failed", request.url));
  const codeVerifier = (await cookies()).get("insforge_code_verifier")?.value;
  if (!codeVerifier) return NextResponse.redirect(new URL("/login?error=missing_verifier", request.url));

  const response = NextResponse.redirect(new URL("/chat", request.url));
  const auth = createAuthActions({ requestCookies: request.cookies, responseCookies: response.cookies });
  const { data, error } = await auth.exchangeOAuthCode(code, codeVerifier);
  if (error || !data?.user) return NextResponse.redirect(new URL("/login?error=exchange_failed", request.url));
  response.cookies.delete("insforge_code_verifier");
  await claimGuest(data.user.id);
  response.cookies.delete(GUEST_COOKIE);
  return response;
}
