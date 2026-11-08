"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { claimGuest } from "@/lib/server/store";
import { claimReferral, REF_COOKIE } from "@/lib/server/growth";

export type AuthState = { error: string | null };

const AFTER_SIGN_IN = "/pipeline";

async function appOrigin() {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

const field = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email: field(formData, "email"), password: String(formData.get("password") ?? "") });
  if (error || !data?.user) return { error: "Sign in failed. Check your email and password." };
  await claimGuest(data.user.id);
  redirect(AFTER_SIGN_IN);
}

export async function signUp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const password = String(formData.get("password") ?? "");
  if (password.length < 6) return { error: "Use at least 6 characters for your password." };
  const supabase = await createSupabaseServerClient();
  const name = field(formData, "name") || undefined;
  const { data, error } = await supabase.auth.signUp({
    email: field(formData, "email"),
    password,
    options: { data: name ? { name } : {}, emailRedirectTo: `${await appOrigin()}/api/auth/callback` },
  });
  if (error) return { error: error.message ?? "Could not create your account." };
  // With "Confirm email" on, Supabase creates the user but returns no session until the link is clicked.
  if (data.user && !data.session) return { error: "Check your inbox to verify your email, then sign in." };
  if (data.user) {
    await claimGuest(data.user.id);
    const jar = await cookies();
    await claimReferral(data.user.id, jar.get(REF_COOKIE)?.value);
    jar.delete(REF_COOKIE);
  }
  redirect(AFTER_SIGN_IN);
}

export async function signInWithProvider(provider: "google" | "github") {
  const supabase = await createSupabaseServerClient();
  // The PKCE verifier is stored in a cookie by the Supabase client; the callback route reads it back.
  const { data, error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: `${await appOrigin()}/api/auth/callback`, skipBrowserRedirect: true } });
  if (error || !data?.url) redirect("/login?error=oauth_failed");
  redirect(data.url);
}

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/");
}
