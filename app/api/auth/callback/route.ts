import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { GUEST_COOKIE } from "@/lib/server/guest-cookie";
import { claimGuest } from "@/lib/server/store";
import { loadProfile } from "@/lib/server/profile";
import { claimReferral, REF_COOKIE } from "@/lib/server/growth";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";

/**
 * Where Google/GitHub sign-in and email-confirmation links land: exchanges the one-time `code` for a
 * session (the PKCE verifier cookie was set when sign-in started) and writes the session cookies to the redirect.
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (request.nextUrl.searchParams.get("error") || !code) return NextResponse.redirect(new URL("/login?error=oauth_failed", request.url));

  const response = NextResponse.redirect(new URL("/pipeline", request.url));
  const supabase = createServerClient(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => { for (const { name, value, options } of list) response.cookies.set(name, value, options); },
    },
  });
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data?.user) return NextResponse.redirect(new URL("/login?error=exchange_failed", request.url));
  // OAuth doesn't say whether the account is new; no profile row yet is the best signal.
  const fresh = !(await loadProfile(data.user.id));
  await claimGuest(data.user.id);
  response.cookies.delete(GUEST_COOKIE);
  if (fresh) await claimReferral(data.user.id, request.cookies.get(REF_COOKIE)?.value);
  response.cookies.delete(REF_COOKIE);
  return response;
}
