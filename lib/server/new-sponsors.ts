import "server-only";
import { adminDb } from "@/lib/supabase/admin";
import { ANOMALY_PER_WEEK, rankNewSponsors, type NewSponsor } from "@/lib/new-sponsors";
import { MARKETS, workRights, type Market, type WorkProfile } from "@/lib/visa";
import { UK_PRIORITY_ROUTES } from "@/lib/ingest/boards";

const db = () => adminDb();

type Row = { id: string; name: string; display_name: string | null; country: "GB" | "NL"; city: string | null; slug: string | null; first_listed: string; rating: string | null; routes: string[] };

/**
 * Employers new on the register since `since`, in the markets where this student needs a sponsor,
 * ranked for them. Empty when a week's count looks like a matching change rather than real news.
 */
export async function newSponsorsFor(p: { work: WorkProfile; targetCountries: string[]; families: string[]; cities: string[] }, since: string, limit: number): Promise<NewSponsor[]> {
  const rights = workRights(p.work);
  const wanted = (p.targetCountries.length ? p.targetCountries : MARKETS).filter((c): c is Market => (MARKETS as string[]).includes(c));
  const markets = wanted.filter((m) => m !== "IE" && rights[m] !== "free"); // Ireland has no licence register
  if (!markets.length) return [];

  const sinceDay = since.slice(0, 10);
  const { data, error } = await db().from("sponsor_licences").select("id,name,display_name,country,city,slug,first_listed,rating,routes")
    .in("country", markets).eq("listed", true).not("first_listed", "is", null).gte("first_listed", sinceDay).order("first_listed", { ascending: false }).limit(ANOMALY_PER_WEEK + 1);
  if (error) throw new Error(error.message);
  const rows = ((data ?? []) as Row[]).filter((r) => r.country !== "GB" || r.routes.some((x) => x === "Skilled Worker" || (UK_PRIORITY_ROUTES as readonly string[]).includes(x)));
  if ((data ?? []).length > ANOMALY_PER_WEEK) {
    console.error(`[new-sponsors] ${data!.length}+ new register entries since ${sinceDay}: treating as a matching change, showing none`);
    return [];
  }
  if (!rows.length) return [];

  // Open roles in the student's field, on boards we've linked to these entries.
  const roles = new Map<string, number>();
  let q = db().from("jobs").select("licence_id").eq("active", true).in("licence_id", rows.map((r) => r.id)).in("licence_match", ["exact", "unique"]);
  if (p.families.length) q = q.in("family", p.families);
  const { data: jobs } = await q.limit(2000);
  for (const j of (jobs ?? []) as { licence_id: string }[]) roles.set(j.licence_id, (roles.get(j.licence_id) ?? 0) + 1);

  return rankNewSponsors(rows.map((r) => ({
    id: r.id, name: r.display_name ?? r.name, country: r.country, city: r.city, slug: r.slug, firstListed: r.first_listed, rating: r.rating, routes: r.routes, openRoles: roles.get(r.id) ?? 0,
  })), p.cities, limit);
}
