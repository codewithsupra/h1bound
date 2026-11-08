/**
 * Sets sponsor_licences.board_match for every register entry that holds a job board: how sure we are
 * that the board's brand IS that entry (exact | unique | ambiguous, see lib/ingest/boards.ts).
 * Dry run by default: prints the distribution and writes nothing. --apply writes board_match.
 * After applying, the next job refresh stamps jobs.licence_match (run scripts/refresh-jobs.mts to do it now).
 * Usage: npx tsx --env-file=.env.local scripts/classify-board-links.mts [--apply]
 */
import { scriptDb } from "../lib/supabase/script";
import { linkMatch, rivalsOf, type LinkMatch } from "../lib/ingest/boards";

const apply = process.argv.includes("--apply");
const db = scriptDb();

type E = { id: string; country: string; key: string; name: string; display_name: string | null; board_kind: string | null; board_match: LinkMatch | null };
const all: E[] = [];
// Before the migration there is no board_match column: read without it so the dry run still works.
let cols = "id,country,key,name,display_name,board_kind,board_match";
for (let from = 0; ; from += 1000) {
  let { data, error } = await db.from("sponsor_licences").select(cols).eq("listed", true).order("id").range(from, from + 999);
  if (error && /board_match/.test(error.message) && cols.includes("board_match")) {
    if (apply) throw new Error("board_match column missing: apply migration 20261101140000_licence-link-confidence.sql first");
    cols = "id,country,key,name,display_name,board_kind";
    ({ data, error } = await db.from("sponsor_licences").select(cols).eq("listed", true).order("id").range(from, from + 999));
  }
  if (error) throw new Error(error.message);
  all.push(...(data as unknown as E[]));
  if ((data as unknown[]).length < 1000) break;
}
const byCountry = new Map<string, E[]>();
for (const e of all) (byCountry.get(e.country) ?? byCountry.set(e.country, []).get(e.country)!).push(e);

const boards = all.filter((e) => e.board_kind);
const counts: Record<string, number> = { exact: 0, unique: 0, ambiguous: 0, rejected: 0, changed: 0 };
const updates: { id: string; match: LinkMatch }[] = [];
for (const b of boards) {
  const brand = b.display_name ?? b.name;
  const pool = byCountry.get(b.country) ?? [];
  const m = linkMatch(brand, b.name, rivalsOf(brand, b, pool).map((r) => r.name)) ?? "ambiguous";
  counts[m]++;
  if (m !== b.board_match) { counts.changed++; updates.push({ id: b.id, match: m }); }
}
console.log(`${boards.length} register entries hold a board:`, counts);

// Impact: active jobs currently linked to each class of entry.
const ids: Record<LinkMatch, string[]> = { exact: [], unique: [], ambiguous: [] };
for (const b of boards) ids[linkMatch(b.display_name ?? b.name, b.name, rivalsOf(b.display_name ?? b.name, b, byCountry.get(b.country) ?? []).map((r) => r.name)) ?? "ambiguous"].push(b.id);
for (const k of ["exact", "unique", "ambiguous"] as const) {
  let n = 0;
  for (let i = 0; i < ids[k].length; i += 50) {
    const { count, error } = await db.from("jobs").select("id", { count: "exact", head: true }).eq("active", true).in("licence_id", ids[k].slice(i, i + 50));
    if (error) throw new Error(`job count: ${error.message}`);
    n += count ?? 0;
  }
  console.log(`  ${k}: ${ids[k].length} entries, ${n} active jobs currently linked`);
}

if (!apply) console.log("dry run: nothing written. Re-run with --apply.");
else {
  for (let i = 0; i < updates.length; i += 25) {
    await Promise.all(updates.slice(i, i + 25).map(async (u) => {
      const { error } = await db.from("sponsor_licences").update({ board_match: u.match }).eq("id", u.id);
      if (error) throw new Error(error.message);
    }));
  }
  console.log(`wrote ${updates.length} rows`);
}
