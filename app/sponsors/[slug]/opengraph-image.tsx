import { OG_SIZE, ogCard } from "@/lib/og/card";
import { companyLabel } from "@/lib/employer";
import { getSponsor } from "@/lib/server/sponsors";

export const alt = "H-1B sponsorship record";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const r = await getSponsor((await params).slug);
  if (!r) return ogCard({ kicker: "H-1B sponsor lookup", title: "Does this company sponsor?", sub: "Real US Dept. of Labor filings for 52,000+ employers." });
  const name = companyLabel(r.display_name, r.name);
  return ogCard({
    kicker: `Does ${name} sponsor H-1Bs?`,
    title: `${r.total_filings.toLocaleString("en-US")} H-1B filings in FY${r.fiscal_year}`,
    sub: `${name} · US Dept. of Labor LCA data · h1bound`,
  });
}
