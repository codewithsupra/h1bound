import "server-only";
import { adminDb } from "@/lib/supabase/admin";
import { fetchAll } from "@/lib/supabase/page";
import { FAMILY_LABEL, type TitleFamily } from "@/lib/titles";

export type HiringSponsor = {
  id: string; name: string; registerName: string; country: "GB" | "NL" | "IE"; city: string | null; slug: string | null;
  rating: string | null; routes: string[]; openRoles: number; topRoles: string[]; newOnRegister: boolean;
};

const NEW_DAYS = 14;

/**
 * Employers on a sponsor register, with a confirmed link to their public job board, that have open
 * roles right now: the free "Sponsors hiring now" list. B-rated UK licences are left out.
 */
export async function sponsorsHiringNow(): Promise<HiringSponsor[]> {
  const db = adminDb();
  const jobs = await fetchAll<{ licence_id: string; family: string | null }>((from, to) =>
    db.from("jobs").select("licence_id,family").eq("active", true).not("licence_id", "is", null).in("licence_match", ["exact", "unique"]).in("country", ["GB", "NL", "IE"]).range(from, to), 50_000);
  const byLicence = new Map<string, Map<string, number>>();
  for (const j of jobs) {
    const fam = byLicence.get(j.licence_id) ?? new Map<string, number>();
    fam.set(j.family ?? "other", (fam.get(j.family ?? "other") ?? 0) + 1);
    byLicence.set(j.licence_id, fam);
  }
  const ids = [...byLicence.keys()];
  const out: HiringSponsor[] = [];
  const recent = new Date(Date.now() - NEW_DAYS * 86_400_000).toISOString().slice(0, 10);
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await db.from("sponsor_licences").select("id,name,display_name,country,city,slug,rating,routes,first_listed,listed").in("id", ids.slice(i, i + 200));
    if (error) throw new Error(error.message);
    for (const l of (data ?? []) as { id: string; name: string; display_name: string | null; country: "GB" | "NL" | "IE"; city: string | null; slug: string | null; rating: string | null; routes: string[]; first_listed: string | null; listed: boolean }[]) {
      if (!l.listed || l.rating === "B") continue;
      const fam = byLicence.get(l.id)!;
      const openRoles = [...fam.values()].reduce((a, n) => a + n, 0);
      const topRoles = [...fam.entries()].filter(([f]) => f !== "other").sort((a, b) => b[1] - a[1]).slice(0, 2).map(([f]) => FAMILY_LABEL[f as TitleFamily] ?? f);
      out.push({ id: l.id, name: l.display_name ?? l.name, registerName: l.name, country: l.country, city: l.city, slug: l.slug, rating: l.rating, routes: l.routes, openRoles, topRoles, newOnRegister: Boolean(l.first_listed && l.first_listed >= recent) });
    }
  }
  return out.sort((a, b) => b.openRoles - a.openRoles || a.name.localeCompare(b.name));
}

export const registerPage = (s: Pick<HiringSponsor, "country" | "slug">, base = "") =>
  s.slug ? `${base}/sponsors/${s.country === "GB" ? "uk" : s.country === "NL" ? "nl" : "ie"}/${s.slug}` : null;

const cell = (v: string | number | null) => {
  const t = String(v ?? "");
  // Quote everything, and defuse spreadsheet formulas (a cell starting with = + - @ runs in Excel).
  return `"${(/^[=+\-@]/.test(t) ? `'${t}` : t).replace(/"/g, '""')}"`;
};

export function hiringCsv(rows: HiringSponsor[], base: string): string {
  const head = ["employer", "register_name", "country", "city", "uk_rating", "routes", "open_roles", "main_roles", "new_on_register", "register_page"];
  const lines = rows.map((r) => [r.name, r.registerName, r.country, r.city, r.rating, r.routes.join("; "), r.openRoles, r.topRoles.join("; "), r.newOnRegister ? "yes" : "", registerPage(r, base)].map(cell).join(","));
  return [head.join(","), ...lines].join("\r\n") + "\r\n";
}
