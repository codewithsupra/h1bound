import { parseNlRegister, parseUkRegister, type Country, type Licence } from "./registers";
import { withRetry } from "./refresh";
import { assignSlugs } from "../slug";

/**
 * Downloads the UK and NL registers and upserts them into sponsor_licences. Shared by
 * scripts/import-registers.mts (which also loads the Irish xlsx files) and the weekly cron route.
 */

type Db = { from(table: string): any }; // eslint-disable-line @typescript-eslint/no-explicit-any
type Fetch = typeof fetch;

const UK_PAGE = "https://www.gov.uk/government/publications/register-of-licensed-sponsors-workers";
const NL_PAGE = "https://ind.nl/en/public-register-recognised-sponsors/public-register-regular-labour-and-highly-skilled-migrants";
const UA = { "user-agent": "Mozilla/5.0 (compatible; job-matcher register import)" };

async function text(url: string, f: Fetch) {
  const res = await f(url, { headers: UA });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.text();
}

/** The CSV link on gov.uk changes with every daily republish; the file name carries its date. */
export function ukCsvLink(html: string): { url: string; date: string } | null {
  const m = html.match(/https:\/\/assets\.publishing\.service\.gov\.uk\/[^"]+?(\d{4}-\d{2}-\d{2})\.csv/);
  return m ? { url: m[0], date: m[1] } : null;
}

export async function downloadRegister(country: Exclude<Country, "IE">, f: Fetch = fetch): Promise<{ licences: Licence[]; date: string }> {
  if (country === "GB") {
    const link = ukCsvLink(await text(UK_PAGE, f));
    if (!link) throw new Error("UK register: CSV link not found on gov.uk page");
    return { licences: parseUkRegister(await text(link.url, f)), date: link.date };
  }
  return { licences: parseNlRegister(await text(NL_PAGE, f)), date: new Date().toISOString().slice(0, 10) };
}

const BATCH = 1000;

/**
 * Upserts one country's register and marks employers missing from it as no longer listed.
 * A sanity floor stops a truncated download from delisting everyone.
 */
export async function upsertLicences(db: Db, country: Country, licences: Licence[], date: string, log: (s: string) => void = () => {}) {
  const floor = { GB: 50_000, NL: 5_000, IE: 3_000 }[country];
  if (licences.length < floor) throw new Error(`${country} register has only ${licences.length} employers (expected ≥ ${floor}); not importing`);
  const now = new Date().toISOString();
  for (let i = 0; i < licences.length; i += BATCH) {
    const chunk = licences.slice(i, i + BATCH).map((l) => ({
      country, key: l.key, name: l.name, city: l.city, region: l.region, routes: l.routes, rating: l.rating,
      reg_id: l.regId, permits: l.permits, source_date: date, listed: true, updated_at: now,
    }));
    await withRetry(async () => {
      const { error } = await db.from("sponsor_licences").upsert(chunk, { onConflict: "country,key" });
      if (error) throw new Error(`${country} batch ${i}: ${error.message}`);
    });
    log(`${country} ${Math.min(i + BATCH, licences.length).toLocaleString()} / ${licences.length.toLocaleString()}`);
  }
  const { error } = await db.from("sponsor_licences").update({ listed: false, updated_at: now }).eq("country", country).lt("source_date", date);
  if (error) throw new Error(`${country} delist: ${error.message}`);
  return fillLicenceSlugs(db, country, log);
}

type SlugRow = { id: string; country: Country; key: string; name: string; source_date: string; display_name: string | null; permits: Record<string, number>; slug: string | null };

/** Slugs are unique per country (/sponsors/uk/<slug>) and never change once assigned. */
export async function fillLicenceSlugs(db: Db, country: Country, log: (s: string) => void = () => {}) {
  const rows: SlugRow[] = [];
  for (let from = 0; ; from += BATCH) {
    const { data, error } = await db.from("sponsor_licences").select("id,country,key,name,source_date,display_name,permits,slug").eq("country", country).order("id").range(from, from + BATCH - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data as SlugRow[]));
    if ((data as SlugRow[]).length < BATCH) break;
  }
  const missing = rows.filter((r) => !r.slug);
  const total = (p: Record<string, number>) => Object.values(p).reduce((a, n) => a + n, 0);
  const slugs = assignSlugs(missing.map((r) => ({ id: r.id, name: r.name, display_name: r.display_name, total_filings: total(r.permits) })), rows.flatMap((r) => (r.slug ? [r.slug] : [])));
  log(`${country}: ${rows.length} employers, ${missing.length} need slugs`);
  // Upsert on id, carrying the NOT NULL columns unchanged, so each batch is one round trip.
  for (let i = 0; i < missing.length; i += BATCH) {
    const chunk = missing.slice(i, i + BATCH).map((r) => ({ id: r.id, country: r.country, key: r.key, name: r.name, source_date: r.source_date, slug: slugs.get(r.id)! }));
    await withRetry(async () => {
      const { error } = await db.from("sponsor_licences").upsert(chunk, { onConflict: "id" });
      if (error) throw new Error(`slug batch ${i}: ${error.message}`);
    });
  }
  return missing.length;
}
