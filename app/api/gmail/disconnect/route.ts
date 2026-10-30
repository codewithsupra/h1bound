import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/insforge/server";
import { disconnectGmail } from "@/lib/server/gmail";

export async function POST() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await disconnectGmail(user.id);
  return NextResponse.json({ ok: true });
}
