/**
 * Loads the official sponsor registers into public.sponsor_licences.
 * Usage: npx tsx --env-file=.env.local scripts/import-registers.mts [GB] [NL] [IE] [--dry]
 * GB and NL also refresh weekly via /api/cron/registers; IE (monthly xlsx) only through this script.
 */
import ExcelJS from "exceljs";
import { createAdminClient } from "@insforge/sdk";
import { mergeYears, parseIePermits, type Country, type Licence } from "../lib/ingest/registers";
import { downloadRegister, upsertLicences } from "../lib/ingest/load-registers";

const args = process.argv.slice(2);
const dry = args.includes("--dry");
const wanted = (args.filter((a) => !a.startsWith("--")) as Country[]).filter((c) => ["GB", "NL", "IE"].includes(c));
const countries: Country[] = wanted.length ? wanted : ["GB", "NL", "IE"];
const db = createAdminClient({ baseUrl: process.env.NEXT_PUBLIC_INSFORGE_URL!, apiKey: process.env.INSFORGE_API_KEY! }).database;

const IE_STATS = (year: number) => `https://enterprise.gov.ie/en/publications/employment-permit-statistics-${year}.html`;

/** The two most recent years of Irish permits-by-company files. */
async function downloadIreland(): Promise<{ licences: Licence[]; date: string }> {
  const thisYear = new Date().getFullYear();
  const years: Licence[][] = [];
  for (const year of [thisYear - 1, thisYear]) {
    const page = await (await fetch(IE_STATS(year), { headers: { "user-agent": "Mozilla/5.0" } })).text();
    const href = page.match(/href="([^"]*compan[^"]*\.xlsx)"/i)?.[1];
    if (!href) { console.log(`IE ${year}: no permits-by-company file yet`); continue; }
    const res = await fetch(new URL(href, "https://enterprise.gov.ie").toString(), { headers: { "user-agent": "Mozilla/5.0" } });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await res.arrayBuffer());
    const rows = (wb.worksheets[0].getSheetValues() as unknown[]).filter(Array.isArray).map((r) =>
      (r as unknown[]).map((c) => (c && typeof c === "object" && "result" in c ? (c as { result: unknown }).result : c)),
    );
    const parsed = parseIePermits(rows, String(year));
    console.log(`IE ${year}: ${parsed.length} employers`);
    years.push(parsed);
  }
  return { licences: mergeYears(...years), date: new Date().toISOString().slice(0, 10) };
}

for (const c of countries) {
  const { licences, date } = c === "IE" ? await downloadIreland() : await downloadRegister(c);
  console.log(`${c}: ${licences.length.toLocaleString()} employers (register of ${date})`);
  if (dry) continue;
  const slugged = await upsertLicences(db, c, licences, date, (s) => process.stdout.write(`\r${s}   `));
  console.log(`\n${c}: done, ${slugged} new slugs`);
}
