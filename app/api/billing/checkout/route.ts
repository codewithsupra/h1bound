import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/supabase/server";
import { hasPaidPlan } from "@/lib/server/growth";

/**
 * Starts Stripe Checkout. Paid plans are not live: the checkout used InsForge's managed Stripe
 * integration, which went away with the move to Supabase, and a direct Stripe integration (checkout
 * session + signed webhook writing public.billing_entitlements) has not been built yet. Until then
 * this answers 503 and the upgrade page says so. Pro is granted only by the webhook, never by a
 * success URL, when it is built.
 */
export async function POST() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (await hasPaidPlan(user.id)) return NextResponse.json({ error: "You're already on Pro.", manage: true }, { status: 409 });
  return NextResponse.json({ error: "Payments aren't set up yet." }, { status: 503 });
}
