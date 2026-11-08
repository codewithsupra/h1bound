import { NextResponse } from "next/server";
import { adminDb } from "@/lib/supabase/admin";

/** RFC 8058 one-click unsubscribe (mail clients POST here from the List-Unsubscribe header). */
export async function POST(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  await adminDb().rpc("unsubscribe", { p_token: token });
  return new NextResponse(null, { status: 204 });
}
