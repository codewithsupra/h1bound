import { beforeEach, describe, expect, it, vi } from "vitest";
import Stripe from "stripe";
import { NextRequest } from "next/server";
import { createFakeDb, type FakeDb } from "./helpers/fake-db";

let db: FakeDb;
let session: { id: string; email: string; name: string | null } | null = null;
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ adminDb: () => db.database }));
vi.mock("@/lib/supabase/server", () => ({ getSessionUser: async () => session }));
vi.mock("@/lib/server/email", () => ({ sendEmail: vi.fn(async () => true) }));

process.env.STRIPE_SECRET_KEY = "rk_test_dummy";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_secret";
process.env.NEXT_PUBLIC_APP_URL = "https://app.test";
process.env.NEXT_PUBLIC_PRICE_EUR_MONTH = "price_eur";
process.env.NEXT_PUBLIC_PRICE_USD_MONTH = "price_usd";

const { setStripeForTests } = await import("@/lib/server/stripe");
const { POST: webhook } = await import("@/app/api/billing/webhook/route");
const { POST: checkout } = await import("@/app/api/billing/checkout/route");
const { POST: portal } = await import("@/app/api/billing/portal/route");

// A real client, so signature checks run Stripe's own code; only network calls are stubbed.
const real = new Stripe("rk_test_dummy");
const subs = new Map<string, unknown>();
const retrieveSub = vi.fn(async (id: string) => { const s = subs.get(id); if (!s) throw new Error("No such subscription"); return s; });
const createCustomer = vi.fn(async () => ({ id: "cus_new" }));
const createSession = vi.fn<(p: Record<string, unknown>) => Promise<{ url: string }>>(async () => ({ url: "https://checkout.stripe.com/c/pay/cs_test_1" }));
const createPortal = vi.fn(async () => ({ url: "https://billing.stripe.com/p/session/1" }));
const retrieveCharge = vi.fn(async () => ({ id: "ch_1", customer: "cus_alice" }));
const fake = Object.assign(Object.create(real), {
  subscriptions: { retrieve: retrieveSub },
  customers: { create: createCustomer },
  checkout: { sessions: { create: createSession } },
  billingPortal: { sessions: { create: createPortal } },
  charges: { retrieve: retrieveCharge },
  webhooks: real.webhooks,
}) as Stripe;

const ALICE = { id: "user-alice", email: "alice@example.com", name: "Alice Rao" };
const DAY = 86_400;
const now = Math.floor(Date.now() / 1000);

function sub(id: string, status: string, customer = "cus_alice", price = "price_eur") {
  return { id, object: "subscription", customer, status, cancel_at: null, metadata: {}, items: { data: [{ price: { id: price, recurring: { interval: "month" } }, current_period_end: now + 30 * DAY }] } };
}

function signed(event: { id: string; type: string; data: { object: unknown } }, secret = "whsec_test_secret") {
  const payload = JSON.stringify({ object: "event", api_version: "2026-11-18.endive", created: now, livemode: false, ...event });
  const header = real.webhooks.generateTestHeaderString({ payload, secret });
  return new NextRequest("https://app.test/api/billing/webhook", { method: "POST", body: payload, headers: { "stripe-signature": header } });
}
const entitlement = (user = ALICE.id) => db.tables.billing_entitlements?.find((r) => r.user_id === user);

beforeEach(() => {
  db = createFakeDb({ billing_customers: [{ user_id: ALICE.id, provider_customer_id: "cus_alice", environment: "test" }], billing_entitlements: [], billing_events: [] });
  subs.clear();
  for (const f of [retrieveSub, createCustomer, createSession, createPortal, retrieveCharge]) f.mockClear();
  setStripeForTests(fake);
  session = ALICE;
});

describe("POST /api/billing/webhook", () => {
  it("rejects a missing or forged signature and touches nothing", async () => {
    const forged = signed({ id: "evt_1", type: "customer.subscription.updated", data: { object: sub("sub_1", "active") } }, "whsec_wrong");
    expect((await webhook(forged)).status).toBe(400);
    const unsigned = new NextRequest("https://app.test/api/billing/webhook", { method: "POST", body: "{}" });
    expect((await webhook(unsigned)).status).toBe(400);
    expect(retrieveSub).not.toHaveBeenCalled();
    expect(db.tables.billing_entitlements).toHaveLength(0);
  });

  it("syncs a subscription from Stripe's current state, not the event body", async () => {
    subs.set("sub_1", sub("sub_1", "active"));
    const res = await webhook(signed({ id: "evt_1", type: "customer.subscription.updated", data: { object: sub("sub_1", "incomplete") } }));
    expect(res.status).toBe(200);
    expect(entitlement()).toMatchObject({ provider: "stripe", environment: "test", status: "active", price_id: "price_eur", plan_interval: "month", provider_subscription_id: "sub_1" });
    expect(entitlement()?.current_period_end).toBe(new Date((now + 30 * DAY) * 1000).toISOString());
  });

  it("processes each event once, however often Stripe retries it", async () => {
    subs.set("sub_1", sub("sub_1", "active"));
    const evt = { id: "evt_dup", type: "customer.subscription.created", data: { object: sub("sub_1", "active") } };
    await webhook(signed(evt));
    const again = await (await webhook(signed(evt))).json();
    expect(again).toMatchObject({ duplicate: true });
    expect(retrieveSub).toHaveBeenCalledTimes(1);
    expect(db.tables.billing_events.map((e) => e.id)).toEqual(["evt_dup"]);
  });

  it("a deleted subscription ends Pro", async () => {
    subs.set("sub_1", sub("sub_1", "canceled"));
    db.tables.billing_entitlements.push({ user_id: ALICE.id, provider: "stripe", environment: "test", status: "active", provider_subscription_id: "sub_1" });
    await webhook(signed({ id: "evt_del", type: "customer.subscription.deleted", data: { object: sub("sub_1", "canceled") } }));
    expect(entitlement()?.status).toBe("canceled");
  });

  it("a late event for an old, ended subscription doesn't overwrite a newer live one", async () => {
    subs.set("sub_old", sub("sub_old", "canceled"));
    db.tables.billing_entitlements.push({ user_id: ALICE.id, provider: "stripe", environment: "test", status: "active", provider_subscription_id: "sub_new" });
    const out = await (await webhook(signed({ id: "evt_late", type: "customer.subscription.deleted", data: { object: sub("sub_old", "canceled") } }))).json();
    expect(out.outcome).toBe("kept_newer");
    expect(entitlement()).toMatchObject({ status: "active", provider_subscription_id: "sub_new" });
  });

  it("ignores customers it doesn't know, without granting anything", async () => {
    subs.set("sub_x", sub("sub_x", "active", "cus_stranger"));
    const out = await (await webhook(signed({ id: "evt_x", type: "customer.subscription.created", data: { object: sub("sub_x", "active", "cus_stranger") } }))).json();
    expect(out.outcome).toBe("unknown_customer");
    expect(db.tables.billing_entitlements).toHaveLength(0);
  });

  it("checkout completion grants Pro only once the payment has settled", async () => {
    subs.set("sub_1", sub("sub_1", "active"));
    const pending = { id: "cs_1", object: "checkout.session", mode: "subscription", payment_status: "unpaid", subscription: "sub_1", client_reference_id: ALICE.id };
    const out = await (await webhook(signed({ id: "evt_cs1", type: "checkout.session.completed", data: { object: pending } }))).json();
    expect(out.outcome).toMatch(/waiting/);
    expect(db.tables.billing_entitlements).toHaveLength(0);
    await webhook(signed({ id: "evt_cs2", type: "checkout.session.async_payment_succeeded", data: { object: { ...pending, payment_status: "paid" } } }));
    expect(entitlement()?.status).toBe("active");
  });

  it("invoice events re-sync the subscription they belong to", async () => {
    subs.set("sub_1", sub("sub_1", "past_due"));
    const invoice = { id: "in_1", object: "invoice", parent: { type: "subscription_details", subscription_details: { subscription: "sub_1" } } };
    await webhook(signed({ id: "evt_inv", type: "invoice.payment_failed", data: { object: invoice } }));
    expect(entitlement()?.status).toBe("past_due");
  });

  it("disputes are flagged for a human, with no automatic change", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const out = await (await webhook(signed({ id: "evt_dp", type: "charge.dispute.created", data: { object: { id: "dp_1", object: "dispute", charge: "ch_1" } } }))).json();
    expect(out.outcome).toMatch(/dispute on charge ch_1 for user user-alice/);
    expect(spy.mock.calls.some((c) => String(c[0]).startsWith("[billing-alert]"))).toBe(true);
    expect(db.tables.billing_entitlements).toHaveLength(0);
    spy.mockRestore();
  });

  it("answers 500 when applying fails, and doesn't mark the event done, so Stripe retries", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await webhook(signed({ id: "evt_fail", type: "customer.subscription.updated", data: { object: sub("sub_missing", "active") } }));
    expect(res.status).toBe(500);
    expect(db.tables.billing_events).toHaveLength(0);
    spy.mockRestore();
  });
});

describe("POST /api/billing/checkout", () => {
  const call = (country = "NL") => checkout(new NextRequest("https://app.test/api/billing/checkout", { method: "POST", headers: { "x-vercel-ip-country": country } }));

  it("needs a signed-in user", async () => {
    session = null;
    expect((await call()).status).toBe(401);
  });

  it("opens a subscription checkout at the local price, reusing the stored customer", async () => {
    const res = await call("NL");
    expect(await res.json()).toEqual({ url: "https://checkout.stripe.com/c/pay/cs_test_1" });
    const p = createSession.mock.calls[0][0];
    expect(p).toMatchObject({ mode: "subscription", customer: "cus_alice", client_reference_id: ALICE.id, line_items: [{ price: "price_eur", quantity: 1 }], success_url: "https://app.test/settings?upgraded=1", cancel_url: "https://app.test/upgrade?canceled=1" });
    expect(p).not.toHaveProperty("payment_method_types");
    expect(String(p.integration_identifier)).toMatch(/^sponsorbound-pro-[a-z]{8}$/);
    expect(createCustomer).not.toHaveBeenCalled();
  });

  it("creates a Stripe customer once for a new buyer and remembers it", async () => {
    db.tables.billing_customers.length = 0;
    await call("US");
    await call("US");
    expect(createCustomer).toHaveBeenCalledTimes(1);
    expect(db.tables.billing_customers).toMatchObject([{ user_id: ALICE.id, provider_customer_id: "cus_new" }]);
    expect(createSession.mock.calls[0][0]).toMatchObject({ line_items: [{ price: "price_usd", quantity: 1 }] });
  });

  it("won't sell Pro twice", async () => {
    db.tables.billing_entitlements.push({ user_id: ALICE.id, status: "active" });
    expect((await call()).status).toBe(409);
    expect(createSession).not.toHaveBeenCalled();
  });

  it("says payments aren't set up when the keys are missing", async () => {
    const key = process.env.STRIPE_WEBHOOK_SECRET;
    delete process.env.STRIPE_WEBHOOK_SECRET;
    expect((await call()).status).toBe(503);
    process.env.STRIPE_WEBHOOK_SECRET = key;
  });
});

describe("POST /api/billing/portal", () => {
  it("opens the portal for the user's own customer", async () => {
    const res = await portal(new NextRequest("https://app.test/api/billing/portal", { method: "POST" }));
    expect(await res.json()).toEqual({ url: "https://billing.stripe.com/p/session/1" });
    expect(createPortal).toHaveBeenCalledWith({ customer: "cus_alice", return_url: "https://app.test/settings" });
  });
  it("404 for someone who never subscribed", async () => {
    db.tables.billing_customers.length = 0;
    expect((await portal(new NextRequest("https://app.test/api/billing/portal", { method: "POST" }))).status).toBe(404);
  });
});
