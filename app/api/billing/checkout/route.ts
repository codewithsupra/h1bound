import { headers } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { createInsForgeServerClient, getSessionUser } from "@/lib/insforge/server";
import { currencyForCountry, PAYMENTS_ENV, PRICES } from "@/lib/billing";
import { hasPaidPlan } from "@/lib/server/growth";

/** Starts Stripe Checkout. Pro is granted only by the webhook trigger, never by the success URL. */
export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // Trial users can buy; only an existing subscription blocks a second checkout.
  if (await hasPaidPlan(user.id)) return NextResponse.json({ error: "You're already on Pro.", manage: true }, { status: 409 });

  const price = PRICES[currencyForCountry((await headers()).get("x-vercel-ip-country"))];
  if (!price.id) return NextResponse.json({ error: "Payments aren't set up yet." }, { status: 503 });
  const origin = request.nextUrl.origin;
  const bucket = Math.floor(Date.now() / (10 * 60_000));

  const insforge = await createInsForgeServerClient();
  const { data, error } = await insforge.payments.stripe.createCheckoutSession(PAYMENTS_ENV, {
    mode: "subscription",
    lineItems: [{ priceId: price.id, quantity: 1 }],
    successUrl: `${origin}/chat?pro=welcome`,
    cancelUrl: `${origin}/upgrade?canceled=1`,
    subject: { type: "user", id: user.id },
    customerEmail: user.email,
    metadata: { app: "h1bound" },
    idempotencyKey: `h1b:${user.id}:${price.id}:${bucket}`,
  });
  const url = data?.checkoutSession?.url;
  if (error || !url) return NextResponse.json({ error: "Couldn't start checkout. Try again." }, { status: 502 });
  return NextResponse.json({ url });
}
