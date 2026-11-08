/**
 * Draws the samples that the sponsor-matching evaluation set is labeled from, and the ambiguity
 * stats for board-to-register links. Read-only.
 * Usage: npx tsx --env-file=.env.local scripts/eval-draw-sample.mts [--unlinked N] [--out file.json]
 */
import { writeFileSync } from "node:fs";
import { scriptDb } from "../lib/supabase/script";
import { licenceKey } from "../lib/ingest/registers";

const args = process.argv.slice(2);
const flag = (n: string, d: string) => args[args.indexOf(`--${n}`) + 1] ?? d;
const N = Number(flag("unlinked", "70"));
const db = scriptDb();

type Lic = { id: string; country: string; key: string; name: string; board_kind: string | null; board_slug: string | null; display_name: string | null };
const all: Lic[] = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await db.from("sponsor_licences").select("id,country,key,name,board_kind,board_slug,display_name").eq("listed", true).order("id").range(from, from + 999);
  if (error) throw new Error(error.message);
  all.push(...(data as Lic[]));
  if ((data as Lic[]).length < 1000) break;
}
console.log(`register entries loaded: ${all.length}`);

const byFirst = new Map<string, Lic[]>();
for (const l of all) {
  const t = l.key.split(" ")[0];
  (byFirst.get(`${l.country}:${t}`) ?? byFirst.set(`${l.country}:${t}`, []).get(`${l.country}:${t}`)!).push(l);
}

// 1. Ambiguity of board links: a board whose brand is a prefix of several register entries.
const boards = all.filter((l) => l.board_kind);
let prefixOnly = 0, ambiguous = 0;
const amb: { country: string; slug: string; kind: string; display: string | null; linkedTo: string; rivals: string[] }[] = [];
for (const b of boards) {
  const slug = licenceKey(b.board_slug!.replace(/-/g, " "));
  if (b.key === slug) continue;
  prefixOnly++;
  const rivals = (byFirst.get(`${b.country}:${slug.split(" ")[0]}`) ?? []).filter((o) => o.id !== b.id && (o.key === slug || o.key.startsWith(`${slug} `)));
  if (rivals.length) { ambiguous++; amb.push({ country: b.country, slug: b.board_slug!, kind: b.board_kind!, display: b.display_name, linkedTo: b.name, rivals: rivals.slice(0, 4).map((r) => r.name) }); }
}
console.log(`boards: ${boards.length}, prefix-only links: ${prefixOnly}, of which with rival register entries: ${ambiguous}`);

// 2. Unlinked jobs: distinct employer names with no register link, plus register candidates by first word.
const counts = new Map<string, { company: string; country: string; jobs: number }>();
for (let from = 0; ; from += 1000) {
  const { data, error } = await db.from("jobs").select("company,country").eq("active", true).is("licence_id", null).in("country", ["GB", "NL", "IE"]).order("id").range(from, from + 999);
  if (error) throw new Error(error.message);
  for (const r of data as { company: string; country: string }[]) {
    const k = `${r.country}:${r.company}`;
    const c = counts.get(k) ?? { company: r.company, country: r.country, jobs: 0 };
    c.jobs++;
    counts.set(k, c);
  }
  if ((data as unknown[]).length < 1000) break;
}
// Fixed sample: ordered by a stable hash of the name, so reruns draw the same employers.
const hash = (s: string) => { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; };
const unlinked = [...counts.values()].sort((a, b) => hash(a.company + a.country) - hash(b.company + b.country)).slice(0, N);
console.log(`unlinked employers: ${counts.size}, sampled ${unlinked.length}`);
const withCandidates = unlinked.map((u) => {
  const key = licenceKey(u.company);
  const cands = (byFirst.get(`${u.country}:${key.split(" ")[0]}`) ?? []).slice(0, 6).map((c) => c.name);
  return { ...u, key, candidates: cands };
});
writeFileSync(flag("out", "/dev/null"), JSON.stringify({ ambiguous: amb, unlinked: withCandidates }, null, 1));
console.log(JSON.stringify({ ambiguous: amb.slice(0, 40), unlinkedCount: withCandidates.length }, null, 1));
