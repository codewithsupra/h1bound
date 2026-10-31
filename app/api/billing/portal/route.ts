import { NextResponse, type NextRequest } from "next/server";
import { createInsForgeServerClient, getSessionUser } from "@/lib/insforge/server";
import { PAYMENTS_ENV } from "@/lib/billing";

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const insforge = await createInsForgeServerClient();
  const { data, error } = await insforge.payments.stripe.createCustomerPortalSession(PAYMENTS_ENV, {
    subject: { type: "user", id: user.id },
    returnUrl: `${request.nextUrl.origin}/settings`,
  });
  const url = data?.customerPortalSession?.url;
  if (error || !url) return NextResponse.json({ error: "No subscription to manage yet." }, { status: 404 });
  return NextResponse.json({ url });
}
