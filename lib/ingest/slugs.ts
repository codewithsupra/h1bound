import { assignSlugs, withTrustedDisplayNames, type SlugCandidate } from "../slug";

/**
 * Gives every company without a slug a unique one; existing slugs are never changed.
 * Shared by scripts/backfill-slugs.mts and scripts/load-sponsors.mts.
 */

type Db = { from(table: string): any }; // eslint-disable-line @typescript-eslint/no-explicit-any
type Row = SlugCandidate & { key: string; fiscal_year: number; slug: string | null };

const PAGE = 1000;

export async function fillMissingSlugs(db: Db, log: (s: string) => void = () => {}) {
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db.from("companies").select("id,key,name,display_name,fiscal_year,total_filings,slug").order("id").range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data as Row[]));
    if ((data as Row[]).length < PAGE) break;
  }
  const missing = withTrustedDisplayNames(rows).filter((r) => !r.slug);
  const slugs = assignSlugs(missing, rows.flatMap((r) => (r.slug ? [r.slug] : [])));
  log(`${rows.length} companies, ${missing.length} need slugs`);

  // Upsert on id, carrying the NOT NULL columns unchanged, so each batch is one round trip.
  for (let i = 0; i < missing.length; i += PAGE) {
    const chunk = missing.slice(i, i + PAGE).map((r) => ({ id: r.id, key: r.key, name: r.name, fiscal_year: r.fiscal_year, slug: slugs.get(r.id)! }));
    const { error } = await db.from("companies").upsert(chunk, { onConflict: "id" });
    if (error) throw new Error(`slug batch ${i}: ${error.message}`);
    log(`${Math.min(i + PAGE, missing.length)} / ${missing.length}`);
  }
  return missing.length;
}
