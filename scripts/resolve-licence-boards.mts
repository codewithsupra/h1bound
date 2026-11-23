/**
 * Finds public job boards (Greenhouse, Ashby, Lever, Recruitee) for UK, Dutch and Irish register
 * entries by probing slug guesses. A board is kept only if (a) its company name matches the register
 * name where the ATS reports one, and (b) it lists jobs in the employer's own country.
 * Usage: npx tsx --env-file=.env.local scripts/resolve-licence-boards.mts [GB|NL|IE ...] [--limit N] [--match <name>]
 * RESOLVE_CONCURRENCY=30 raises the parallel probes (default 10); the work is network-bound.
 */
import { scriptDb } from "../lib/supabase/script";
import { UK_PRIORITY_ROUTES } from "../lib/ingest/boards";
import { discoverBoards, type Lic } from "../lib/ingest/discover";

const args = process.argv.slice(2);
const limit = Number(args[args.indexOf("--limit") + 1]) || 100_000;
const wanted = args.filter((a) => ["GB", "NL", "IE"].includes(a));
const countries = wanted.length ? wanted : ["IE", "GB", "NL"];
const db = scriptDb();

const COLS = "id,country,name,permits";

async function pageAll(build: (from: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>) {
  const out: Lic[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from);
    if (error) throw new Error(error.message);
    out.push(...(data as Lic[]));
    if ((data as Lic[]).length < 1000) break;
  }
  return out;
}

const match = args.includes("--match") ? args[args.indexOf("--match") + 1] : null;
const candidates: Lic[] = [];
// --match <text>: re-check specific employers by name, even if already checked (for debugging a miss).
if (match) candidates.push(...(((await db.from("sponsor_licences").select(COLS).ilike("name", `%${match}%`).in("country", countries).limit(20)).data ?? []) as Lic[]));
else for (const c of countries) {
  const base = () => db.from("sponsor_licences").select(COLS).eq("country", c).eq("listed", true).is("board_checked_at", null);
  if (c === "GB") candidates.push(...(await pageAll((f) => base().overlaps("routes", UK_PRIORITY_ROUTES).order("id").range(f, f + 999))));
  else if (c === "IE") {
    const all = await pageAll((f) => base().order("id").range(f, f + 999));
    const total = (l: Lic) => Object.values(l.permits).reduce((a, n) => a + n, 0);
    candidates.push(...all.filter((l) => total(l) >= 3).sort((a, b) => total(b) - total(a)));
  } else candidates.push(...(await pageAll((f) => base().order("id").range(f, f + 999))));
}
const queue = candidates.slice(0, limit);
console.log(`probing ${queue.length} employers (${countries.join(", ")})`);

const r = await discoverBoards(db as never, queue, {
  concurrency: Number(process.env.RESOLVE_CONCURRENCY) || 10,
  onHit: (l, h) => console.log(`✓ ${l.country} ${l.name} → ${h.kind}/${h.slug} [${h.match}] (${h.inCountry} jobs in ${l.country})`),
  onProgress: (done, found) => console.log(`… ${done} checked, ${found} boards`),
});
console.log(`done: ${r.found} boards among ${r.done} employers`);
