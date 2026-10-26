import { NextResponse } from "next/server";
import { createAdminInsForge } from "@/lib/insforge/admin";

/** RFC 8058 one-click unsubscribe (mail clients POST here from the List-Unsubscribe header). */
export async function POST(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  await createAdminInsForge().database.rpc("unsubscribe", { p_token: token });
  return new NextResponse(null, { status: 204 });
}
