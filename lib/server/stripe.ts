import "server-only";
import Stripe from "stripe";
import { adminDb } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/server/email";
import { SITE_NAME } from "@/lib/site";

/**
 * Direct Stripe subscriptions for Pro.
 *
 * - Pro is granted only here, from signed webhook events, never from the checkout success page.
 * - Every event re-reads the subscription from Stripe, so out-of-order or retried events can't leave
 *   a stale status behind.
 * - Events resolve to a user through Stripe's object graph (subscription -> customer ->
 *   billing_customers); metadata is only a fallback.
 *
 * Use a restricted key (rk_...) with write access to Customers, Checkout Sessions, Customer portal,
 * and read access to Subscriptions, Invoices and Charges. It is server-only and never printed.
 */

let client: Stripe | null = null;

export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET);
}

export function stripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY is not set");
  client ??= new Stripe(process.env.STRIPE_SECRET_KEY, { appInfo: { name: SITE_NAME } });
  return client;
}

/** Test or live, from the key itself, so test events never grant live Pro by accident. */
export const stripeEnvironment = (): "test" | "live" => (/^(sk|rk)_live_/.test(process.env.STRIPE_SECRET_KEY ?? "") ? "live" : "test");

/** Test hook: lets tests inject a fake client. */
export function setStripeForTests(fake: Stripe | null) { client = fake; }

const db = () => adminDb();
const idOf = (x: string | { id: string } | null | undefined) => (typeof x === "string" ? x : x?.id ?? null);
const iso = (secs: number | null | undefined) => (secs ? new Date(secs * 1000).toISOString() : null);

/** The user's Stripe Customer, created on first checkout and remembered. */
export async function customerFor(user: { id: string; email: string; name: string | null }): Promise<string> {
  const existing = await db().from("billing_customers").select("provider_customer_id").eq("user_id", user.id).maybeSingle();
  if (existing.data) return (existing.data as { provider_customer_id: string }).provider_customer_id;
  const customer = await stripe().customers.create(
    { email: user.email, name: user.name ?? undefined, metadata: { user_id: user.id } },
    { idempotencyKey: `customer-${user.id}` }, // a double click can't create two customers
  );
  const { error } = await db().from("billing_customers").insert({ user_id: user.id, provider_customer_id: customer.id, environment: stripeEnvironment() });
  if (error) {
    // Another request won the race: use the row it stored.
    const again = await db().from("billing_customers").select("provider_customer_id").eq("user_id", user.id).maybeSingle();
    if (again.data) return (again.data as { provider_customer_id: string }).provider_customer_id;
    throw new Error(error.message);
  }
  return customer.id;
}

export async function customerIdForUser(userId: string): Promise<string | null> {
  const { data } = await db().from("billing_customers").select("provider_customer_id").eq("user_id", userId).maybeSingle();
  return (data as { provider_customer_id: string } | null)?.provider_customer_id ?? null;
}

async function userForCustomer(customerId: string): Promise<string | null> {
  const { data } = await db().from("billing_customers").select("user_id").eq("provider_customer_id", customerId).maybeSingle();
  return (data as { user_id: string } | null)?.user_id ?? null;
}

const LIVE_STATUSES = new Set(["active", "trialing", "past_due"]);
export type SyncResult = "synced" | "unknown_customer" | "kept_newer";

/**
 * Reads the subscription from Stripe and writes the user's entitlement. A stale event for an old,
 * ended subscription never overwrites a different subscription that is still live.
 */
export async function syncSubscription(subscriptionId: string, fallbackUserId?: string | null): Promise<SyncResult> {
  const sub = await stripe().subscriptions.retrieve(subscriptionId);
  const customerId = idOf(sub.customer as string | { id: string });
  const userId = (customerId && (await userForCustomer(customerId))) || fallbackUserId || null;
  if (!userId) return "unknown_customer";

  const current = await db().from("billing_entitlements").select("provider_subscription_id,status").eq("user_id", userId).maybeSingle();
  const row = current.data as { provider_subscription_id: string | null; status: string } | null;
  if (row && row.provider_subscription_id && row.provider_subscription_id !== sub.id && LIVE_STATUSES.has(row.status) && !LIVE_STATUSES.has(sub.status)) {
    return "kept_newer";
  }

  const item = sub.items?.data?.[0];
  const interval = item?.price?.recurring?.interval;
  const { error } = await db().from("billing_entitlements").upsert({
    user_id: userId,
    provider: "stripe",
    environment: stripeEnvironment(),
    status: sub.status,
    price_id: item?.price?.id ?? null,
    plan_interval: interval === "month" || interval === "year" ? interval : null,
    current_period_end: iso(item?.current_period_end),
    cancel_at: iso(sub.cancel_at),
    provider_subscription_id: sub.id,
    last_event_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });
  if (error) throw new Error(error.message);
  return "synced";
}

/** Disputes, refunds and fraud warnings: no automatic action, but nobody should miss them. */
export async function billingAlert(kind: string, chargeId: string | null) {
  let who = "unknown customer";
  if (chargeId) {
    try {
      const charge = await stripe().charges.retrieve(chargeId);
      const customerId = idOf(charge.customer as string | { id: string } | null);
      const userId = customerId ? await userForCustomer(customerId) : null;
      who = userId ? `user ${userId} (customer ${customerId})` : customerId ? `customer ${customerId}, not linked to a user` : who;
    } catch (e) {
      who = `charge lookup failed: ${(e as Error).message}`;
    }
  }
  const text = `${kind} on charge ${chargeId ?? "?"} for ${who}. Review it in the Stripe Dashboard; nothing was changed automatically.`;
  console.error(`[billing-alert] ${text}`);
  const owner = process.env.OWNER_EMAIL;
  if (owner) await sendEmail(owner, `${SITE_NAME}: Stripe ${kind}`, text, "", "").catch(() => false);
  return text;
}

type Obj = { id?: string; object?: string; [k: string]: unknown };

/**
 * Applies one verified webhook event. Returns what happened, for logs and tests. Unhandled event
 * types are acknowledged and ignored (subscribe only to the ones listed in docs/OPERATIONS.md).
 */
export async function handleStripeEvent(event: Stripe.Event): Promise<string> {
  const o = event.data.object as unknown as Obj;
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const s = o as unknown as Stripe.Checkout.Session;
      if (s.mode !== "subscription") return "ignored: not a subscription checkout";
      // Async payment methods complete the session before the money arrives; wait for that.
      if (s.payment_status !== "paid" && s.payment_status !== "no_payment_required") return "waiting: payment not settled";
      const subId = idOf(s.subscription as string | { id: string } | null);
      return subId ? syncSubscription(subId, s.client_reference_id) : "ignored: no subscription";
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const s = o as unknown as Stripe.Subscription;
      return syncSubscription(s.id, (s.metadata as Record<string, string> | undefined)?.user_id);
    }
    case "invoice.paid":
    case "invoice.payment_failed": {
      const inv = o as unknown as Stripe.Invoice;
      const subId = idOf(inv.parent?.subscription_details?.subscription as string | { id: string } | null | undefined);
      return subId ? syncSubscription(subId) : "ignored: invoice without a subscription";
    }
    case "charge.dispute.created":
      return billingAlert("dispute", idOf((o as unknown as Stripe.Dispute).charge as string | { id: string }));
    case "charge.refunded":
      return billingAlert("refund", o.id ?? null);
    case "radar.early_fraud_warning.created":
      return billingAlert("early fraud warning", idOf((o as unknown as Stripe.Radar.EarlyFraudWarning).charge as string | { id: string }));
    default:
      return `ignored: ${event.type}`;
  }
}
