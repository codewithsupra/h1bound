import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const supa = {
  signInWithPassword: vi.fn(), signUp: vi.fn(), signInWithOAuth: vi.fn(), signOut: vi.fn(), getUser: vi.fn(), exchangeCodeForSession: vi.fn(),
};
const claimGuest = vi.fn();
const claimReferral = vi.fn();
const loadProfile = vi.fn();
const jar = { get: vi.fn(), delete: vi.fn(), set: vi.fn(), getAll: () => [] as unknown[] };
const redirect = vi.fn((to: string) => { throw new Error(`REDIRECT ${to}`); });

vi.mock("next/navigation", () => ({ redirect: (to: string) => redirect(to) }));
vi.mock("next/headers", () => ({ cookies: async () => jar, headers: async () => new Headers({ host: "localhost:3000" }) }));
vi.mock("@supabase/ssr", () => ({ createServerClient: () => ({ auth: supa }) }));
vi.mock("@/lib/server/store", () => ({ claimGuest: (...a: unknown[]) => claimGuest(...a) }));
vi.mock("@/lib/server/growth", () => ({ claimReferral: (...a: unknown[]) => claimReferral(...a), REF_COOKIE: "h1b_ref" }));
vi.mock("@/lib/server/profile", () => ({ loadProfile: (...a: unknown[]) => loadProfile(...a) }));

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";

const { signIn, signUp, signInWithProvider } = await import("@/app/actions/auth");
const { getSessionUser } = await import("@/lib/supabase/server");
const { GET: callback } = await import("@/app/api/auth/callback/route");

const form = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };
const redirected = async (p: Promise<unknown>) => p.then(() => "no redirect", (e: Error) => e.message);

beforeEach(() => {
  for (const f of [...Object.values(supa), claimGuest, claimReferral, loadProfile, redirect, jar.get, jar.delete, jar.set]) f.mockClear();
  redirect.mockImplementation((to: string) => { throw new Error(`REDIRECT ${to}`); });
  jar.get.mockReturnValue(undefined);
});

describe("signIn", () => {
  it("signs in, adopts the guest session and goes to the pipeline", async () => {
    supa.signInWithPassword.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    expect(await redirected(signIn({ error: null }, form({ email: " a@b.com ", password: "secret1" })))).toBe("REDIRECT /pipeline");
    expect(supa.signInWithPassword).toHaveBeenCalledWith({ email: "a@b.com", password: "secret1" });
    expect(claimGuest).toHaveBeenCalledWith("u1");
  });
  it("gives one generic message for a wrong password or an unknown email, and adopts nothing", async () => {
    supa.signInWithPassword.mockResolvedValue({ data: { user: null }, error: { message: "Invalid login credentials" } });
    const out = await signIn({ error: null }, form({ email: "a@b.com", password: "wrong" }));
    expect(out.error).toBe("Sign in failed. Check your email and password.");
    expect(claimGuest).not.toHaveBeenCalled();
  });
});

describe("signUp", () => {
  it("rejects a short password before calling Supabase", async () => {
    expect((await signUp({ error: null }, form({ email: "a@b.com", password: "123" }))).error).toMatch(/at least 6/);
    expect(supa.signUp).not.toHaveBeenCalled();
  });
  it("asks the user to verify their email when Supabase returns no session, and adopts nothing yet", async () => {
    supa.signUp.mockResolvedValue({ data: { user: { id: "u2" }, session: null }, error: null });
    const out = await signUp({ error: null }, form({ email: "a@b.com", password: "secret1", name: "Asha" }));
    expect(out.error).toMatch(/Check your inbox/);
    expect(claimGuest).not.toHaveBeenCalled();
    expect(supa.signUp.mock.calls[0][0].options.data).toEqual({ name: "Asha" });
  });
  it("signs a new user straight in when confirmation is off, adopting the guest session and the referral", async () => {
    supa.signUp.mockResolvedValue({ data: { user: { id: "u3" }, session: { access_token: "t" } }, error: null });
    jar.get.mockReturnValue({ value: "abc123" });
    expect(await redirected(signUp({ error: null }, form({ email: "a@b.com", password: "secret1" })))).toBe("REDIRECT /pipeline");
    expect(claimGuest).toHaveBeenCalledWith("u3");
    expect(claimReferral).toHaveBeenCalledWith("u3", "abc123");
  });
  it("shows Supabase's reason when sign-up fails", async () => {
    supa.signUp.mockResolvedValue({ data: { user: null, session: null }, error: { message: "User already registered" } });
    expect((await signUp({ error: null }, form({ email: "a@b.com", password: "secret1" }))).error).toBe("User already registered");
  });
});

describe("signInWithProvider", () => {
  it("sends the browser to the provider", async () => {
    supa.signInWithOAuth.mockResolvedValue({ data: { url: "https://accounts.google.com/o/oauth2/auth?x=1" }, error: null });
    expect(await redirected(signInWithProvider("google"))).toBe("REDIRECT https://accounts.google.com/o/oauth2/auth?x=1");
    expect(supa.signInWithOAuth.mock.calls[0][0].options.redirectTo).toBe("http://localhost:3000/api/auth/callback");
  });
  it("returns to the login page with an error when it can't start", async () => {
    supa.signInWithOAuth.mockResolvedValue({ data: { url: null }, error: { message: "provider not enabled" } });
    expect(await redirected(signInWithProvider("github"))).toBe("REDIRECT /login?error=oauth_failed");
  });
});

describe("getSessionUser", () => {
  it("returns the verified user with the name from their profile", async () => {
    supa.getUser.mockResolvedValue({ data: { user: { id: "u1", email: "a@b.com", user_metadata: { full_name: "Asha Rao" } } }, error: null });
    expect(await getSessionUser()).toEqual({ id: "u1", email: "a@b.com", name: "Asha Rao" });
  });
  it("is null when signed out, when Supabase errors, or when the user has no email", async () => {
    supa.getUser.mockResolvedValue({ data: { user: null }, error: null });
    expect(await getSessionUser()).toBeNull();
    supa.getUser.mockResolvedValue({ data: { user: null }, error: { message: "jwt expired" } });
    expect(await getSessionUser()).toBeNull();
    supa.getUser.mockResolvedValue({ data: { user: { id: "u1", email: null } }, error: null });
    expect(await getSessionUser()).toBeNull();
  });
});

describe("GET /api/auth/callback", () => {
  const call = (qs: string, cookie = "") => callback(new NextRequest(`http://localhost:3000/api/auth/callback${qs}`, { headers: cookie ? { cookie } : {} }));
  it("refuses a request with no code or with a provider error", async () => {
    expect((await call("")).headers.get("location")).toContain("/login?error=oauth_failed");
    expect((await call("?error=access_denied&code=x")).headers.get("location")).toContain("/login?error=oauth_failed");
    expect(supa.exchangeCodeForSession).not.toHaveBeenCalled();
  });
  it("sends the user back to sign in if the code can't be exchanged", async () => {
    supa.exchangeCodeForSession.mockResolvedValue({ data: { user: null }, error: { message: "bad verifier" } });
    expect((await call("?code=abc")).headers.get("location")).toContain("/login?error=exchange_failed");
    expect(claimGuest).not.toHaveBeenCalled();
  });
  it("signs in, adopts the guest session, and only counts a referral for a brand-new account", async () => {
    supa.exchangeCodeForSession.mockResolvedValue({ data: { user: { id: "u9" } }, error: null });
    loadProfile.mockResolvedValue(null);
    const fresh = await call("?code=abc", "h1b_ref=ref1");
    expect(fresh.headers.get("location")).toContain("/pipeline");
    expect(claimGuest).toHaveBeenCalledWith("u9");
    expect(claimReferral).toHaveBeenCalledWith("u9", "ref1");
    claimReferral.mockClear();
    loadProfile.mockResolvedValue({ row: {} });
    await call("?code=abc", "h1b_ref=ref1");
    expect(claimReferral).not.toHaveBeenCalled();
  });
});
