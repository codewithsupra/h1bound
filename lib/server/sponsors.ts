import "server-only";
import { cache } from "react";
import { createAdminInsForge } from "@/lib/insforge/admin";
import type { SponsorStats } from "@/lib/sponsor";

/** Reads behind the public sponsor pages (/sponsors, /sponsors/<slug>) and the sitemap. Public DOL data only. */

export type SponsorRow = {
  id: string;
  slug: string;
  name: string;
  display_name: string | null;
  top_states: string[];
  fiscal_year: number;
  total_filings: number;
  by_family: SponsorStats["byFamily"];
  last_filed: string | null;
  board_kind: string | null;
  board_slug: string | null;
  updated_at: string;
};

const COLS = "id,slug,name,display_name,top_states,fiscal_year,total_filings,by_family,last_filed,board_kind,board_slug,updated_at";
const PAGE = 1000;
/** Sponsors below this many filings stay reachable but out of the sitemap (thin pages). */
export const SITEMAP_MIN_FILINGS = 10;

const db = () => createAdminInsForge().database;

export const statsOf = (r: SponsorRow): SponsorStats => ({ fiscalYear: r.fiscal_year, total: r.total_filings, byFamily: r.by_family, lastFiled: r.last_filed });

/**
 * Boards that resolved to several unrelated employers (one "national" board for NIH, Amtrak, …).
 * Those are false matches, so their brand name and job count aren't credited to anyone.
 */
const sharedBoards = cache(async (): Promise<Set<string>> => {
  const { data, error } = await db().from("companies").select("board_kind,board_slug").not("board_slug", "is", null);
  if (error) throw new Error(error.message);
  const seen = new Map<string, number>();
  for (const b of data as { board_kind: string; board_slug: string }[]) seen.set(`${b.board_kind}:${b.board_slug}`, (seen.get(`${b.board_kind}:${b.board_slug}`) ?? 0) + 1);
  return new Set([...seen].filter(([, n]) => n > 1).map(([k]) => k));
});

async function withoutFalseBoards(rows: SponsorRow[]): Promise<SponsorRow[]> {
  const shared = await sharedBoards();
  return rows.map((r) => (r.board_slug && shared.has(`${r.board_kind}:${r.board_slug}`) ? { ...r, display_name: null, board_kind: null, board_slug: null } : r));
}

/** Cached per request so generateMetadata and the page share one query. */
export const getSponsor = cache(async (slug: string): Promise<SponsorRow | null> => {
  const { data } = await db().from("companies").select(COLS).eq("slug", slug).maybeSingle();
  return data ? (await withoutFalseBoards([data as SponsorRow]))[0] : null;
});

/** Open US jobs on the employer's own board, or null when it has none. */
export async function openUsJobCount(r: Pick<SponsorRow, "id" | "board_kind">): Promise<number | null> {
  if (!r.board_kind) return null;
  const { count } = await db().from("jobs").select("id", { count: "exact", head: true }).eq("company_id", r.id).eq("active", true).eq("is_us", true);
  return count ?? 0;
}

export async function topSponsors(limit: number): Promise<SponsorRow[]> {
  const out: SponsorRow[] = [];
  for (let from = 0; from < limit; from += PAGE) {
    const { data, error } = await db().from("companies").select(COLS).not("slug", "is", null).order("total_filings", { ascending: false }).order("id").range(from, Math.min(limit, from + PAGE) - 1);
    if (error) throw new Error(error.message);
    out.push(...(data as SponsorRow[]));
    if ((data as SponsorRow[]).length < PAGE) break;
  }
  return withoutFalseBoards(out);
}

export async function sitemapSponsorCount(): Promise<number> {
  const { count } = await db().from("companies").select("id", { count: "exact", head: true }).not("slug", "is", null).gte("total_filings", SITEMAP_MIN_FILINGS);
  return count ?? 0;
}

/** One sitemap's worth of sponsor slugs, in a stable order (filings desc, then id). */
export async function sitemapSponsors(offset: number, limit: number): Promise<{ slug: string; updated_at: string }[]> {
  const out: { slug: string; updated_at: string }[] = [];
  for (let from = offset; from < offset + limit; from += PAGE) {
    const { data, error } = await db().from("companies").select("slug,updated_at").not("slug", "is", null).gte("total_filings", SITEMAP_MIN_FILINGS)
      .order("total_filings", { ascending: false }).order("id").range(from, Math.min(offset + limit, from + PAGE) - 1);
    if (error) throw new Error(error.message);
    out.push(...(data as { slug: string; updated_at: string }[]));
    if ((data as unknown[]).length < PAGE) break;
  }
  return out;
}
