import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/supabase/server";

/** Opens the Stripe customer portal. Not live yet: see the checkout route. */
export async function POST() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ error: "No subscription to manage yet." }, { status: 404 });
}
