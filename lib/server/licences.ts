import "server-only";
import { createAdminInsForge } from "@/lib/insforge/admin";
import { licenceKey } from "@/lib/ingest/registers";
import { companyLabel } from "@/lib/employer";
import { CITY_COORDS, locate } from "@/lib/eu-geo";
import { COUNTRY_PATH, licenceFlap, licenceLine, permitTotal, type Market } from "@/lib/visa";
import type { BoardRow } from "@/components/landing/flap-board";
import type { Light } from "@/components/landing/night-map";

/** Reads over sponsor_licences for the landing page, the public lookup and /sponsors/{uk,nl,ie}/<slug>. */

const db = () => createAdminInsForge().database;

export type LicenceRow = {
  id: string; country: Market; key: string; name: string; display_name: string | null; city: string | null; region: string | null;
  routes: string[]; rating: string | null; reg_id: string | null; permits: Record<string, number>; source_date: string; listed: boolean; slug: string | null;
};
const COLS = "id,country,key,name,display_name,city,region,routes,rating,reg_id,permits,source_date,listed,slug";

export const licenceName = (l: Pick<LicenceRow, "name" | "display_name">) => companyLabel(l.display_name, l.name);
export const licenceHref = (l: Pick<LicenceRow, "country" | "slug">) => (l.slug ? `/sponsors/${COUNTRY_PATH[l.country]}/${l.slug}` : null);

export async function licenceBySlug(country: Market, slug: string): Promise<LicenceRow | null> {
  const { data } = await db().from("sponsor_licences").select(COLS).eq("country", country).eq("slug", slug).maybeSingle();
  return (data as LicenceRow | null) ?? null;
}

export async function openJobs(licenceId: string, limit = 8) {
  const { data, count } = await db().from("jobs").select("id,title,location,remote,url,posted_at", { count: "exact" }).eq("licence_id", licenceId).eq("active", true).order("posted_at", { ascending: false, nullsFirst: false }).limit(limit);
  return { jobs: (data ?? []) as { id: string; title: string; location: string; remote: boolean; url: string; posted_at: string | null }[], count: count ?? 0 };
}

async function jobCounts(ids: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  await Promise.all(ids.map(async (id) => {
    const { count } = await db().from("jobs").select("id", { count: "exact", head: true }).eq("licence_id", id).eq("active", true);
    out.set(id, count ?? 0);
  }));
  return out;
}

export function toBoardRow(l: LicenceRow, jobs: number): BoardRow {
  const f = licenceFlap(l);
  return { name: licenceName(l), href: licenceHref(l), country: l.country, jobs, licence: f.text, tone: f.tone };
}

/** Prefix search on the comparison key; listed employers with the most open jobs first. */
export async function searchLicences(q: string, country?: Market): Promise<BoardRow[]> {
  const key = licenceKey(q);
  if (key.length < 2) return [];
  let query = db().from("sponsor_licences").select(COLS).like("key", `${key.replace(/[%_\\\\]/g, "")}%`).eq("listed", true);
  if (country) query = query.eq("country", country);
  const { data } = await query.order("key").limit(12);
  const rows = (data ?? []) as LicenceRow[];
  const counts = await jobCounts(rows.map((r) => r.id));
  return rows
    .sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0) || (a.key === key ? -1 : b.key === key ? 1 : 0) || permitTotal(b) - permitTotal(a))
    .slice(0, 5)
    .map((r) => toBoardRow(r, counts.get(r.id) ?? 0));
}

/** Seeded [0,1) from a string, so every visitor sees the same sky. */
function unit(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10_000) / 10_000;
}

const KNOWN_UK_CITIES = Object.keys(CITY_COORDS).map((c) => c.replace(/\b([a-z])/g, (m) => m.toUpperCase()));

/**
 * Landing data: map lights from all three registers (UK employers in cities we can place, NL and IE
 * spread over their main metros), and the board's idle rows: sponsors with the most open jobs.
 */
export async function landingLicences() {
  const pages = (country: Market, n: number, cities?: string[]) =>
    Promise.all(Array.from({ length: Math.ceil(n / 1000) }, (_, p) => {
      let q = db().from("sponsor_licences").select("id,country,key,name,display_name,city,rating,permits,slug").eq("country", country).eq("listed", true);
      if (cities) q = q.in("city", cities);
      return q.order("id").range(p * 1000, p * 1000 + 999);
    }));
  const [gb, nl, ie, linked, total, byCountry] = await Promise.all([
    pages("GB", 2400, KNOWN_UK_CITIES),
    pages("NL", 700),
    pages("IE", 700),
    db().from("jobs").select("licence_id").eq("active", true).not("licence_id", "is", null).limit(20_000),
    db().from("jobs").select("id", { count: "exact", head: true }).eq("active", true).or("country.in.(GB,NL,IE),remote_scope.in.(anywhere,europe)"),
    Promise.all((["GB", "NL", "IE"] as Market[]).map((c) => db().from("sponsor_licences").select("id", { count: "exact", head: true }).eq("country", c).eq("listed", true))),
  ]);
  const failed = [...gb, ...nl, ...ie, linked, total].find((r) => r.error);
  if (failed) throw new Error(`landing licences: ${failed.error!.message}`);

  type Lite = Pick<LicenceRow, "id" | "country" | "key" | "name" | "display_name" | "city" | "rating" | "permits" | "slug">;
  const all = [...gb, ...nl, ...ie].flatMap((p) => (p.data ?? []) as Lite[]);
  const jobsBy = new Map<string, number>();
  for (const r of (linked.data ?? []) as { licence_id: string }[]) jobsBy.set(r.licence_id, (jobsBy.get(r.licence_id) ?? 0) + 1);

  const lights: Light[] = all.flatMap((l) => {
    const at = locate(l.country, l.city, unit(l.key));
    if (!at) return [];
    const permits = permitTotal(l);
    const tag = l.country === "GB" ? (l.rating === "A" ? "A-rated UK sponsor" : "Licensed UK sponsor") : l.country === "NL" ? "Recognised Dutch sponsor" : `${permits.toLocaleString("en-GB")} Irish work permits`;
    return [{ n: licenceName(l), lon: at[0], lat: at[1], w: (jobsBy.get(l.id) ?? 0) * 3 + permits + 1, tag }];
  });

  // Idle board: employers with open jobs we can show today, most first, mixing the three countries.
  const topIds = [...jobsBy.entries()].sort((a, b) => b[1] - a[1]).slice(0, 60).map(([id]) => id);
  const { data: top } = topIds.length ? await db().from("sponsor_licences").select(COLS).in("id", topIds) : { data: [] };
  const idle = ((top ?? []) as LicenceRow[]).sort((a, b) => (jobsBy.get(b.id) ?? 0) - (jobsBy.get(a.id) ?? 0)).map((l) => toBoardRow(l, jobsBy.get(l.id) ?? 0));

  // The featured sponsor for the story and the register card: the UK sponsor with the most open
  // jobs that has an entry-level opening, so the example job is real and plausible for a graduate.
  let feature: { licence: LicenceRow; jobs: number; role: string; city: string } | null = null;
  for (const l of ((top ?? []) as LicenceRow[]).filter((x) => x.country === "GB").sort((a, b) => (jobsBy.get(b.id) ?? 0) - (jobsBy.get(a.id) ?? 0))) {
    const { data: js } = await db().from("jobs").select("title,location,seniority").eq("licence_id", l.id).eq("active", true).eq("country", "GB").in("seniority", ["graduate", "junior"]).limit(1);
    const j = (js ?? [])[0] as { title: string; location: string } | undefined;
    if (j) {
      feature = { licence: l, jobs: jobsBy.get(l.id) ?? 0, role: j.title, city: l.city ?? (j.location.split(",")[0] || "London") };
      break;
    }
  }

  return {
    lights, idle, feature,
    sponsors: Object.fromEntries((["GB", "NL", "IE"] as Market[]).map((c, i) => [c, byCountry[i].count ?? 0])) as Record<Market, number>,
    jobs: total.count ?? 0,
    linkedJobs: (linked.data ?? []).length,
  };
}

export { licenceLine };

export async function listedCount(country: Market): Promise<number> {
  const { count } = await db().from("sponsor_licences").select("id", { count: "exact", head: true }).eq("country", country).eq("listed", true).not("slug", "is", null);
  return count ?? 0;
}

/** One sitemap's worth of register pages for a country, in a stable order. */
export async function sitemapLicences(country: Market, offset: number, limit: number): Promise<{ slug: string; updated_at: string }[]> {
  const out: { slug: string; updated_at: string }[] = [];
  for (let from = offset; from < offset + limit; from += 1000) {
    const { data, error } = await db().from("sponsor_licences").select("slug,updated_at").eq("country", country).eq("listed", true).not("slug", "is", null)
      .order("id").range(from, Math.min(offset + limit, from + 1000) - 1);
    if (error) throw new Error(error.message);
    out.push(...(data as { slug: string; updated_at: string }[]));
    if ((data as unknown[]).length < 1000) break;
  }
  return out;
}
