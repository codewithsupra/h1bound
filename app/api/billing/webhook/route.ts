import { NextResponse, type NextRequest } from "next/server";
import { adminDb } from "@/lib/supabase/admin";
import { handleStripeEvent, stripe, stripeConfigured } from "@/lib/server/stripe";

/**
 * Stripe webhook. Verifies the signature on the raw body, skips events already applied (Stripe
 * retries), applies the event, then records its id. If applying fails it answers 500 so Stripe
 * retries later; applying twice is harmless because every event re-reads the subscription.
 */
export async function POST(req: NextRequest) {
  if (!stripeConfigured()) return NextResponse.json({ error: "not configured" }, { status: 503 });
  const signature = req.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "missing signature" }, { status: 400 });
  const body = await req.text();
  let event;
  try {
    event = stripe().webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    return NextResponse.json({ error: "bad signature" }, { status: 400 });
  }

  const db = adminDb();
  const seen = await db.from("billing_events").select("id").eq("id", event.id).maybeSingle();
  if (seen.data) return NextResponse.json({ received: true, duplicate: true });

  try {
    const outcome = await handleStripeEvent(event);
    await db.from("billing_events").insert({ id: event.id, type: event.type });
    return NextResponse.json({ received: true, outcome });
  } catch (e) {
    console.error(`[billing] webhook ${event.type} ${event.id} failed: ${(e as Error).message}`);
    return NextResponse.json({ error: "processing failed" }, { status: 500 });
  }
}
