import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/supabase/server";
import { customerIdForUser, stripe, stripeConfigured } from "@/lib/server/stripe";

/** Opens the Stripe customer portal (cancel, change card, invoices) for the signed-in subscriber. */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!stripeConfigured()) return NextResponse.json({ error: "Payments aren't set up yet." }, { status: 503 });
  const customer = await customerIdForUser(user.id);
  if (!customer) return NextResponse.json({ error: "No subscription to manage yet." }, { status: 404 });
  const app = process.env.NEXT_PUBLIC_APP_URL ?? req.nextUrl.origin;
  try {
    const session = await stripe().billingPortal.sessions.create({ customer, return_url: `${app}/settings` });
    return NextResponse.json({ url: session.url });
  } catch (e) {
    console.error(`[billing] portal failed: ${(e as Error).message}`);
    return NextResponse.json({ error: "Couldn't open billing. Try again in a minute." }, { status: 502 });
  }
}
