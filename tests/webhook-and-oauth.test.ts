import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

let session: { id: string; email: string; name: string | null } | null = { id: "user-alice", email: "a@x.com", name: null };
const connectGmail = vi.fn();
const claimLink = vi.fn();
const sendText = vi.fn();

vi.mock("@/lib/insforge/server", () => ({ getSessionUser: async () => session }));
vi.mock("@/lib/insforge/admin", () => ({ createAdminInsForge: () => ({ database: { from: () => ({}) } }) }));
vi.mock("@/lib/server/telegram", () => ({
  claimLink: (...a: unknown[]) => claimLink(...a), sendText: (...a: unknown[]) => sendText(...a),
  stopChat: vi.fn(), tg: vi.fn(), userForChat: vi.fn(),
}));
vi.mock("@/lib/server/insight", () => ({ companyInsight: vi.fn() }));

// Real OAuth state helpers; only the network exchange is replaced.
const real = await vi.importActual<typeof import("@/lib/server/gmail")>("@/lib/server/gmail");
vi.mock("@/lib/server/gmail", async (orig) => ({ ...(await orig<typeof import("@/lib/server/gmail")>()), connectGmail: (...a: unknown[]) => connectGmail(...a) }));

const { GET } = await import("@/app/api/gmail/callback/route");
const { POST: telegram } = await import("@/app/api/telegram/route");

describe("Gmail OAuth state", () => {
  it("accepts the state issued to this user and returned with the matching cookie", () => {
    const s = real.newState("user-alice");
    expect(real.checkState(s, s, "user-alice")).toBe(true);
  });
  it("rejects a state issued to another user, so a callback can't be replayed into someone else's account", () => {
    const s = real.newState("user-bob");
    expect(real.checkState(s, s, "user-alice")).toBe(false);
  });
  it("rejects a missing cookie, a different cookie, a missing state and a tampered signature", () => {
    const s = real.newState("user-alice");
    expect(real.checkState(s, undefined, "user-alice")).toBe(false);
    expect(real.checkState(s, real.newState("user-alice"), "user-alice")).toBe(false);
    expect(real.checkState(null, s, "user-alice")).toBe(false);
    const forged = `${s.slice(0, -3)}AAA`;
    expect(real.checkState(forged, forged, "user-alice")).toBe(false);
  });
  it("does not let a state for 'user-alice' pass for a user whose id merely starts the same way", () => {
    const s = real.newState("user-alice-evil");
    expect(real.checkState(s, s, "user-alice")).toBe(false);
  });
});

describe("GET /api/gmail/callback", () => {
  beforeEach(() => { session = { id: "user-alice", email: "a@x.com", name: null }; connectGmail.mockReset(); connectGmail.mockResolvedValue({ email: "a@gmail.com" }); });
  const call = (state: string | null, cookie?: string, extra = "") =>
    GET(new NextRequest(`http://localhost/api/gmail/callback?code=abc${state ? `&state=${state}` : ""}${extra}`, { headers: cookie ? { cookie: `${real.GMAIL_STATE_COOKIE}=${cookie}` } : {} }));

  it("connects Gmail only for a valid state", async () => {
    const s = real.newState("user-alice");
    const res = await call(s, s);
    expect(res.headers.get("location")).toContain("gmail=connected");
    expect(connectGmail).toHaveBeenCalledWith("user-alice", "abc");
  });
  it("refuses a forged or mismatched state without exchanging the code", async () => {
    const res = await call(real.newState("user-bob"), real.newState("user-bob"));
    expect(res.headers.get("location")).toContain("gmail=failed");
    expect(connectGmail).not.toHaveBeenCalled();
  });
  it("sends anonymous callers to sign in", async () => {
    session = null;
    const s = real.newState("user-alice");
    const res = await call(s, s);
    expect(res.headers.get("location")).toContain("/login");
    expect(connectGmail).not.toHaveBeenCalled();
  });
  it("treats the user declining on Google's screen as cancelled", async () => {
    const res = await call(null, undefined, "&error=access_denied");
    expect(res.headers.get("location")).toContain("gmail=cancelled");
    expect(connectGmail).not.toHaveBeenCalled();
  });
});

describe("POST /api/telegram", () => {
  const update = { message: { chat: { id: 42, type: "private" }, text: "/start sometoken1234567890123456" } };
  const post = (secret?: string) => telegram(new Request("http://localhost/api/telegram", { method: "POST", headers: secret === undefined ? {} : { "x-telegram-bot-api-secret-token": secret }, body: JSON.stringify(update) }));
  beforeEach(() => { claimLink.mockReset(); sendText.mockReset(); process.env.TELEGRAM_WEBHOOK_SECRET = "s3cret-value"; });

  it("ignores anyone who doesn't know the webhook secret", async () => {
    for (const secret of [undefined, "", "wrong", "s3cret-valuX", "s3cret-value-and-more"]) expect((await post(secret)).status, String(secret)).toBe(401);
    expect(claimLink).not.toHaveBeenCalled();
    expect(sendText).not.toHaveBeenCalled();
  });
  it("is closed when no secret is configured, even to an empty header", async () => {
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    expect((await post("")).status).toBe(401);
    expect((await post(undefined)).status).toBe(401);
  });
  it("accepts Telegram with the right secret and links the account through the one-time token", async () => {
    claimLink.mockResolvedValue(true);
    sendText.mockResolvedValue(true);
    expect((await post("s3cret-value")).status).toBe(200);
    expect(claimLink).toHaveBeenCalledWith("sometoken1234567890123456", 42);
  });
});
