import { NextResponse, type NextRequest } from "next/server";
import { createAdminInsForge } from "@/lib/insforge/admin";
import { coreEmployer, normalizeEmployer, companyLabel } from "@/lib/employer";
import { sponsorBadge, type SponsorStats } from "@/lib/sponsor";
import { titleFamily } from "@/lib/titles";

/** Public, no-signup sponsor lookup (the landing page's free tool). Public DOL data only. */
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").slice(0, 60);
  const role = req.nextUrl.searchParams.get("role") ?? "software engineer";
  const key = normalizeEmployer(q);
  if (key.length < 2) return NextResponse.json({ results: [] });
  const core = coreEmployer(q) || key;

  const { data } = await createAdminInsForge()
    .database.from("companies")
    .select("slug,name,display_name,top_states,fiscal_year,total_filings,by_family,last_filed")
    .like("key", `${core.replace(/[%_]/g, "")}%`)
    .order("total_filings", { ascending: false })
    .limit(5);

  type Row = { slug: string | null; name: string; display_name: string | null; top_states: string[]; fiscal_year: number; total_filings: number; by_family: SponsorStats["byFamily"]; last_filed: string | null };
  const fam = titleFamily(role);
  const results = ((data ?? []) as Row[]).map((r) => ({
    name: companyLabel(r.display_name, r.name),
    slug: r.slug,
    legalName: r.name,
    states: r.top_states,
    total: r.total_filings,
    roleCount: r.by_family[fam]?.count ?? 0,
    roleMedian: r.by_family[fam]?.medianWage ?? null,
    badge: sponsorBadge({ fiscalYear: r.fiscal_year, total: r.total_filings, byFamily: r.by_family, lastFiled: r.last_filed }, fam),
  }));
  return NextResponse.json({ results }, { headers: { "Cache-Control": "public, s-maxage=3600" } });
}
