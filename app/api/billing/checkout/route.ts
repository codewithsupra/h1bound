import { randomInt } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/supabase/server";
import { hasPaidPlan } from "@/lib/server/growth";
import { priceForCountry } from "@/lib/billing";
import { customerFor, stripe, stripeConfigured } from "@/lib/server/stripe";

const letters = (n: number) => Array.from({ length: n }, () => String.fromCharCode(97 + randomInt(26))).join("");

/**
 * Starts Stripe Checkout for Pro (monthly subscription, price by country). Pro itself is granted
 * only by the signed webhook (app/api/billing/webhook), never by the success URL. Answers 503 until
 * the Stripe keys and price ids are configured.
 */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (await hasPaidPlan(user.id)) return NextResponse.json({ error: "You're already on Pro.", manage: true }, { status: 409 });
  const price = priceForCountry(req.headers.get("x-vercel-ip-country"));
  if (!stripeConfigured() || !price.id) return NextResponse.json({ error: "Payments aren't set up yet." }, { status: 503 });

  const app = process.env.NEXT_PUBLIC_APP_URL ?? req.nextUrl.origin;
  try {
    const customer = await customerFor(user);
    const session = await stripe().checkout.sessions.create({
      mode: "subscription",
      customer,
      client_reference_id: user.id,
      line_items: [{ price: price.id, quantity: 1 }],
      allow_promotion_codes: true,
      // Let a returning customer's card and address be reused and kept current.
      customer_update: { address: "auto", name: "auto" },
      integration_identifier: `sponsorbound-pro-${letters(8)}`,
      success_url: `${app}/settings?upgraded=1`,
      cancel_url: `${app}/upgrade?canceled=1`,
    });
    if (!session.url) throw new Error("Checkout session has no URL");
    return NextResponse.json({ url: session.url });
  } catch (e) {
    console.error(`[billing] checkout failed: ${(e as Error).message}`);
    return NextResponse.json({ error: "Couldn't start checkout. Try again in a minute." }, { status: 502 });
  }
}
