/**
 * Upserts data/out/sponsors-FY<year>.json into public.companies (keyed by normalized name).
 * Usage: npx tsx --env-file=.env.local scripts/load-sponsors.mts 2026
 */
import { readFileSync } from "node:fs";
import { createAdminClient } from "@insforge/sdk";
import type { EmployerOut } from "../lib/ingest/lca";

const fy = process.argv[2];
if (!fy) throw new Error("usage: load-sponsors.mts <fiscalYear>");
const db = createAdminClient({ baseUrl: process.env.NEXT_PUBLIC_INSFORGE_URL!, apiKey: process.env.INSFORGE_API_KEY! }).database;

const rows: EmployerOut[] = JSON.parse(readFileSync(`data/out/sponsors-FY${fy}.json`, "utf8"));
const BATCH = 1000;
for (let i = 0; i < rows.length; i += BATCH) {
  const chunk = rows.slice(i, i + BATCH).map((e) => ({
    key: e.key,
    name: e.name,
    dba: e.dba,
    top_states: e.topStates,
    fiscal_year: e.stats.fiscalYear,
    total_filings: e.stats.total,
    by_family: e.stats.byFamily,
    last_filed: e.stats.lastFiled,
    updated_at: new Date().toISOString(),
  }));
  const { error } = await db.from("companies").upsert(chunk, { onConflict: "key" });
  if (error) throw new Error(`batch ${i}: ${error.message}`);
  process.stdout.write(`\r${Math.min(i + BATCH, rows.length).toLocaleString()} / ${rows.length.toLocaleString()}`);
}
console.log("\ndone");
