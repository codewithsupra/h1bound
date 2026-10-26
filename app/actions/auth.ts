"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createAuthActions } from "@insforge/sdk/ssr";

export type AuthState = { error: string | null };

const AFTER_SIGN_IN = "/chat";

async function appOrigin() {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

const field = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const auth = createAuthActions({ cookies: await cookies() });
  const { data, error } = await auth.signInWithPassword({ email: field(formData, "email"), password: String(formData.get("password") ?? "") });
  if (error || !data?.user) return { error: error?.message ?? "Sign in failed. Check your email and password." };
  redirect(AFTER_SIGN_IN);
}

export async function signUp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const password = String(formData.get("password") ?? "");
  if (password.length < 6) return { error: "Use at least 6 characters for your password." };
  const auth = createAuthActions({ cookies: await cookies() });
  const { data, error } = await auth.signUp({
    email: field(formData, "email"),
    password,
    name: field(formData, "name") || undefined,
    redirectTo: `${await appOrigin()}/login`,
  });
  if (error) return { error: error.message ?? "Could not create your account." };
  if (data?.requireEmailVerification) return { error: "Check your inbox to verify your email, then sign in." };
  redirect(AFTER_SIGN_IN);
}

export async function signInWithProvider(provider: "google" | "github") {
  const cookieStore = await cookies();
  const auth = createAuthActions({ cookies: cookieStore });
  const { data, error } = await auth.signInWithOAuth(provider, { redirectTo: `${await appOrigin()}/api/auth/callback`, skipBrowserRedirect: true });
  if (error || !data?.url || !data.codeVerifier) redirect("/login?error=oauth_failed");
  cookieStore.set("insforge_code_verifier", data.codeVerifier, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 600 });
  redirect(data.url);
}

export async function signOut() {
  const auth = createAuthActions({ cookies: await cookies() });
  await auth.signOut();
  redirect("/");
}
