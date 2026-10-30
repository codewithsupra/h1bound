import { NextResponse, type NextRequest } from "next/server";
import { createAdminInsForge } from "@/lib/insforge/admin";
import { downloadRegister, upsertLicences } from "@/lib/ingest/load-registers";

export const maxDuration = 300;

/**
 * Weekly refresh of the UK and Dutch sponsor registers (InsForge schedule, Bearer CRON_SECRET).
 * `?country=GB|NL`, one per call so each fits in maxDuration. Ireland's monthly xlsx is loaded by script.
 */
export async function POST(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const country = req.nextUrl.searchParams.get("country");
  if (country !== "GB" && country !== "NL") return NextResponse.json({ error: "country must be GB or NL" }, { status: 400 });
  const { licences, date } = await downloadRegister(country);
  const slugged = await upsertLicences(createAdminInsForge().database, country, licences, date);
  return NextResponse.json({ country, employers: licences.length, date, newSlugs: slugged });
}
