/**
 * Adds `rivals` to each brand case in the evaluation fixture: the other register entries in the same
 * country that share the board's brand, computed from the register as it stands. Read-only against the
 * database; rewrites tests/eval/sponsor-record.cases.json. Labels are not touched.
 * Usage: npx tsx --env-file=.env.local scripts/eval-add-rivals.mts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { scriptDb } from "../lib/supabase/script";
import { rivalsOf } from "../lib/ingest/boards";
import type { SponsorRecordCases } from "../lib/eval/sponsor-record";

const file = new URL("../tests/eval/sponsor-record.cases.json", import.meta.url);
const cases = JSON.parse(readFileSync(file, "utf8")) as SponsorRecordCases;
const db = scriptDb();

type E = { id: string; country: string; key: string; name: string };
const all: E[] = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await db.from("sponsor_licences").select("id,country,key,name").eq("listed", true).order("id").range(from, from + 999);
  if (error) throw new Error(error.message);
  all.push(...(data as E[]));
  if ((data as E[]).length < 1000) break;
}
const byCountry = new Map<string, E[]>();
for (const e of all) (byCountry.get(e.country) ?? byCountry.set(e.country, []).get(e.country)!).push(e);

let missing = 0;
for (const c of cases.brand) {
  const pool = byCountry.get(c.country) ?? [];
  const entry = pool.find((e) => e.name === c.registerName);
  if (!entry) { missing++; (c as { rivals?: string[] }).rivals = []; continue; }
  (c as { rivals?: string[] }).rivals = rivalsOf(c.boardName, entry, pool).map((r) => r.name).sort().slice(0, 12);
}
writeFileSync(file, JSON.stringify(cases, null, 1));
console.log(`${cases.brand.length} brand cases, ${cases.brand.filter((c) => (c as { rivals?: string[] }).rivals?.length).length} with rivals, ${missing} entries not found`);
