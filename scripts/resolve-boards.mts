/**
 * Finds the public job board (Greenhouse / Lever / Ashby) for the top-N sponsoring employers by
 * probing slug guesses. Greenhouse responses carry company_name, which we verify; Lever/Ashby
 * slugs are only trusted when they come from the full company name (not a lone first word).
 * Usage: npx tsx --env-file=.env.local scripts/resolve-boards.mts 3000
 */
import { createAdminClient } from "@insforge/sdk";
import { boardSlugs, BOARD_URL, type AtsKind } from "../lib/ingest/ats";
import { coreEmployer, normalizeEmployer } from "../lib/employer";

const N = Number(process.argv[2] ?? 3000);
const db = createAdminClient({ baseUrl: process.env.NEXT_PUBLIC_INSFORGE_URL!, apiKey: process.env.INSFORGE_API_KEY! }).database;

type Co = { id: string; name: string; dba: string | null };
const companies: Co[] = [];
for (let from = 0; from < N; from += 1000) {
  const { data, error } = await db.from("companies").select("id,name,dba").is("board_checked_at", null).order("total_filings", { ascending: false }).range(from, Math.min(N, from + 1000) - 1);
  if (error) throw error;
  companies.push(...(data as Co[]));
}
console.log(`probing ${companies.length} employers`);

async function probe(kind: AtsKind, slug: string): Promise<{ count: number; companyName?: string } | null> {
  try {
    const r = await fetch(BOARD_URL[kind](slug).replace("?content=true", ""), { signal: AbortSignal.timeout(10_000) });
    if (!r.ok) return null;
    const body = (await r.json()) as { jobs?: { company_name?: string }[] } | unknown[];
    const jobs = Array.isArray(body) ? body : (body.jobs ?? []);
    if (!jobs.length) return null;
    return { count: jobs.length, companyName: (jobs[0] as { company_name?: string }).company_name };
  } catch {
    return null;
  }
}

async function resolve(c: Co) {
  const names = [coreEmployer(c.dba ?? ""), coreEmployer(c.name)].filter(Boolean);
  for (const n of names) {
    const slugs = boardSlugs(n);
    for (const [i, slug] of slugs.entries()) {
      const firstWordOnly = i === slugs.length - 1 && n.includes(" ");
      for (const kind of ["greenhouse", "ashby", "lever"] as AtsKind[]) {
        if (firstWordOnly && kind !== "greenhouse") continue;
        if (slug.length < 3) continue;
        const hit = await probe(kind, slug);
        if (!hit) continue;
        if (kind === "greenhouse" && hit.companyName) {
          const a = coreEmployer(hit.companyName), b = coreEmployer(c.name);
          if (!(a === b || a.startsWith(b) || b.startsWith(a) || normalizeEmployer(hit.companyName) === normalizeEmployer(c.dba ?? ""))) continue;
        }
        return { kind, slug, display: hit.companyName ?? null, count: hit.count };
      }
    }
  }
  return null;
}

let done = 0, found = 0;
const queue = [...companies];
await Promise.all(Array.from({ length: 12 }, async () => {
  for (let c = queue.shift(); c; c = queue.shift()) {
    const r = await resolve(c);
    const patch = r
      ? { board_kind: r.kind, board_slug: r.slug, display_name: r.display, board_checked_at: new Date().toISOString() }
      : { board_checked_at: new Date().toISOString() };
    await db.from("companies").update(patch).eq("id", c.id);
    done++;
    if (r) { found++; console.log(`✓ ${c.name} → ${r.kind}/${r.slug} (${r.count} jobs)`); }
    if (done % 100 === 0) console.log(`… ${done}/${companies.length}, ${found} boards`);
  }
}));
console.log(`done: ${found} boards found among ${done} employers`);
