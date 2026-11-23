/**
 * Finds a public job board (Greenhouse, Ashby, Lever, Recruitee) for a register entry by probing
 * slug guesses. A board is kept only if (a) its company name matches the register name where the
 * ATS reports one, and (b) it lists jobs in the employer's own country. Shared by
 * scripts/resolve-licence-boards.mts (bulk) and the weekly new-sponsors job.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { boardSlugs, BOARD_URL, fetchBoard, type AtsKind } from "./ats";
import { coreEmployer } from "../employer";
import { licenceKey } from "./registers";
import { boardFitsCountry, brandMatches, linkMatch, type LinkMatch } from "./boards";

export type Lic = { id: string; country: string; name: string; permits: Record<string, number> };
export type BoardHit = { kind: AtsKind; slug: string; display: string | null; match: LinkMatch; inCountry: number };
type Db = SupabaseClient;

async function probe(kind: AtsKind, slug: string): Promise<{ companyName?: string } | null> {
  try {
    const url = kind === "greenhouse" ? BOARD_URL.greenhouse(slug).replace(/\?.*$/, "") : BOARD_URL[kind](slug);
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

export async function resolveBoard(db: Db, l: Lic): Promise<BoardHit | null> {
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
        // How sure are we this board belongs to THIS entry? Other entries sharing the brand make it only a "possible" link.
        const brand = hit.companyName ?? l.name;
        const bk = licenceKey(brand);
        const { data: rivals } = bk
          ? await db.from("sponsor_licences").select("name").eq("country", l.country).eq("listed", true).neq("id", l.id).or(`key.eq."${bk}",key.like."${bk} %"`).limit(25)
          : { data: [] };
        const match = linkMatch(brand, l.name, ((rivals ?? []) as { name: string }[]).map((r) => r.name)) ?? "ambiguous";
        return { kind, slug, display: hit.companyName ?? null, match, inCountry: jobs.filter((j) => j.country === l.country).length };
      }
    }
  }
  return null;
}

/**
 * Probes a queue of entries with `concurrency` workers, saving each result (or "checked, none")
 * as it goes, until the queue is empty or `deadline` (epoch ms) passes.
 */
export async function discoverBoards(db: Db, queue: Lic[], opts: { concurrency?: number; deadline?: number; onHit?: (l: Lic, r: BoardHit) => void; onProgress?: (done: number, found: number) => void } = {}) {
  const q = [...queue];
  let done = 0, found = 0;
  await Promise.all(Array.from({ length: opts.concurrency ?? 10 }, async () => {
    for (let l = q.shift(); l; l = q.shift()) {
      if (opts.deadline && Date.now() > opts.deadline) return;
      const r = await resolveBoard(db, l).catch(() => null);
      const now = new Date().toISOString();
      const patch = r ? { board_kind: r.kind, board_slug: r.slug, display_name: r.display, board_match: r.match, board_checked_at: now } : { board_checked_at: now };
      await db.from("sponsor_licences").update(patch).eq("id", l.id);
      done++;
      if (r) { found++; opts.onHit?.(l, r); }
      if (done % 250 === 0) opts.onProgress?.(done, found);
    }
  }));
  return { done, found, left: q.length };
}
