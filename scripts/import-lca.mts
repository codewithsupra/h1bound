/**
 * Streams a DOL LCA disclosure .xlsx (250MB+) and writes aggregated employer stats to
 * data/out/sponsors-FY<year>.json. Usage:
 *   npx tsx scripts/import-lca.mts data/raw/LCA_Disclosure_Data_FY2026_Q3.xlsx 2026
 */
import ExcelJS from "exceljs";
import { mkdirSync, writeFileSync } from "node:fs";
import { addRow, finalize, type EmployerAgg, type LcaRow } from "../lib/ingest/lca";

const [file, fy] = process.argv.slice(2);
if (!file || !fy) throw new Error("usage: import-lca.mts <xlsx> <fiscalYear>");

const aggs = new Map<string, EmployerAgg>();
let header: string[] | null = null;
let rows = 0;

const reader = new ExcelJS.stream.xlsx.WorkbookReader(file, { sharedStrings: "cache", worksheets: "emit", hyperlinks: "ignore", styles: "ignore" });
for await (const sheet of reader) {
  for await (const r of sheet) {
    const vals = (r.values as unknown[]).slice(1);
    if (!header) { header = vals.map((v) => String(v ?? "").trim().toUpperCase()); continue; }
    const row: LcaRow = {};
    header.forEach((h, i) => (row[h] = vals[i]));
    addRow(aggs, row);
    if (++rows % 100_000 === 0) console.log(`${rows.toLocaleString()} rows, ${aggs.size.toLocaleString()} employers`);
  }
  break; // data is on the first sheet
}

const out = [...aggs.values()].map((a) => finalize(a, Number(fy))).sort((a, b) => b.stats.total - a.stats.total);
mkdirSync("data/out", { recursive: true });
const path = `data/out/sponsors-FY${fy}.json`;
writeFileSync(path, JSON.stringify(out));
console.log(`done: ${rows.toLocaleString()} rows → ${out.length.toLocaleString()} employers → ${path}`);
console.log("top 10:", out.slice(0, 10).map((e) => `${e.name} (${e.stats.total})`).join(", "));
