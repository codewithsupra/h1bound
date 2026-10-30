/**
 * Finds public job boards (Greenhouse, Ashby, Lever, Recruitee) for UK, Dutch and Irish register
 * entries by probing slug guesses. A board is kept only if (a) its company name matches the register
 * name where the ATS reports one, and (b) it lists jobs in the employer's own country.
 * Usage: npx tsx --env-file=.env.local scripts/resolve-licence-boards.mts [GB|NL|IE ...] [--limit N] [--match <name>]
 */
import { createAdminClient } from "@insforge/sdk";
import { boardSlugs, BOARD_URL, fetchBoard, type AtsKind } from "../lib/ingest/ats";
import { coreEmployer } from "../lib/employer";
import { licenceKey } from "../lib/ingest/registers";
import { boardFitsCountry, brandMatches, UK_PRIORITY_ROUTES } from "../lib/ingest/boards";

const args = process.argv.slice(2);
const limit = Number(args[args.indexOf("--limit") + 1]) || 100_000;
const wanted = args.filter((a) => ["GB", "NL", "IE"].includes(a));
const countries = wanted.length ? wanted : ["IE", "GB", "NL"];
const db = createAdminClient({ baseUrl: process.env.NEXT_PUBLIC_INSFORGE_URL!, apiKey: process.env.INSFORGE_API_KEY! }).database;

type Lic = { id: string; country: string; name: string; permits: Record<string, number> };
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

async function probe(kind: AtsKind, slug: string): Promise<{ companyName?: string } | null> {
  try {
    const url = kind === "greenhouse" ? BOARD_URL.greenhouse(slug).replace("?content=true", "") : BOARD_URL[kind](slug);
    const r = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!r.ok) return null;
    const body = (await r.json()) as { jobs?: { company_name?: string }[]; offers?: { company_name?: string }[] } | unknown[];
    const jobs = Array.isArray(body) ? body : (body.jobs ?? body.offers ?? []);
    if (!jobs.length) return null;
    return { companyName: (jobs[0] as { company_name?: string }).company_name };
  } catch {
    return null;
  }
}

const KINDS: AtsKind[] = ["greenhouse", "ashby", "lever", "recruitee"];
const NAMED = new Set<AtsKind>(["greenhouse", "recruitee"]); // these report a company name we can check

async function resolve(l: Lic) {
  const key = licenceKey(l.name);
  const names = [...new Set([key, coreEmployer(key)].filter(Boolean))];
  const tried = new Set<string>();
  for (const n of names) {
    const slugs = boardSlugs(n);
    for (const [i, slug] of slugs.entries()) {
      const firstWordOnly = i === slugs.length - 1 && n.includes(" ");
      for (const kind of KINDS) {
        if (slug.length < 3 || tried.has(`${kind}:${slug}`)) continue;
        tried.add(`${kind}:${slug}`);
        // A lone first word ("global") is too ambiguous unless the ATS tells us the company name.
        if (firstWordOnly && !NAMED.has(kind)) continue;
        const hit = await probe(kind, slug);
        if (!hit) continue;
        if (NAMED.has(kind) && hit.companyName && !brandMatches(hit.companyName, l.name)) continue;
        const jobs = (await fetchBoard(kind, slug, hit.companyName ?? l.name).catch(() => null)) ?? [];
        if (!boardFitsCountry(jobs, l.country)) continue;
        return { kind, slug, display: hit.companyName ?? null, inCountry: jobs.filter((j) => j.country === l.country).length };
      }
    }
  }
  return null;
}

let done = 0, found = 0;
await Promise.all(Array.from({ length: 10 }, async () => {
  for (let l = queue.shift(); l; l = queue.shift()) {
    const r = await resolve(l).catch(() => null);
    const now = new Date().toISOString();
    const patch = r ? { board_kind: r.kind, board_slug: r.slug, display_name: r.display, board_checked_at: now } : { board_checked_at: now };
    await db.from("sponsor_licences").update(patch).eq("id", l.id);
    done++;
    if (r) { found++; console.log(`✓ ${l.country} ${l.name} → ${r.kind}/${r.slug} (${r.inCountry} jobs in ${l.country})`); }
    if (done % 250 === 0) console.log(`… ${done} checked, ${found} boards`);
  }
}));
console.log(`done: ${found} boards among ${done} employers`);
