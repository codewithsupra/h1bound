/**
 * Draws job-description sentences about visas, sponsorship and right to work, for labeling the
 * "does this vacancy offer sponsorship?" evaluation. Read-only; the draw is fixed by a hash of the job id.
 * Usage: npx tsx --env-file=.env.local scripts/eval-draw-jd.mts [--n 90] --out file.json
 */
import { writeFileSync } from "node:fs";
import { scriptDb } from "../lib/supabase/script";
import { jdSponsorship } from "../lib/jd-signals";

const args = process.argv.slice(2);
const flag = (n: string, d: string) => args[args.indexOf(`--${n}`) + 1] ?? d;
const N = Number(flag("n", "90"));
const db = scriptDb();

const KEYWORD = /sponsor|visa|right to work|work permit|work authori[sz]ation|eligib\w+ to work|immigration|relocation|kennismigrant|employment permit/i;

type Job = { id: string; company: string; country: string | null; title: string; description: string };
const jobs: Job[] = [];
const TEXT = "description.ilike.%sponsor%,description.ilike.%visa%,description.ilike.%right to work%,description.ilike.%work permit%,description.ilike.%immigration%";
for (const scope of ["markets", "remote"] as const) {
  for (let from = 0; ; from += 500) {
    let q = db.from("jobs").select("id,company,country,title,description").eq("active", true).or(TEXT);
    q = scope === "markets" ? q.in("country", ["GB", "NL", "IE"]) : q.is("country", null).eq("remote", true);
    const { data, error } = await q.order("id").range(from, from + 499);
    if (error) throw new Error(error.message);
    jobs.push(...(data as Job[]));
    if ((data as Job[]).length < 500) break;
  }
}

/** A window around the most decisive visa-related phrase, trimmed to sentence edges and kept short: a quote, not the posting. */
function snippet(text: string): string | null {
  const flat = text.replace(/\s+/g, " ");
  const at = flat.search(/sponsor|right to work|work permit|work authori[sz]ation|eligib\w+ to work|kennismigrant|employment permit/i);
  const i = at >= 0 ? at : flat.search(KEYWORD);
  if (i < 0) return null;
  let start = Math.max(0, i - 220);
  const edge = flat.slice(start, i).search(/[.!?]\s+[A-Z*•-]/);
  if (edge >= 0 && start > 0) start += edge + 2;
  return flat.slice(start, i + 240).trim();
}

const hash = (s: string) => { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; };
const rows = jobs.map((j) => ({ id: j.id, company: j.company, country: j.country, title: j.title, snippet: snippet(j.description), model: jdSponsorship(j.description) }))
  .filter((r) => r.snippet).sort((a, b) => hash(a.id) - hash(b.id));

// --strong: only postings the matcher says nothing about but whose excerpt reads like a real visa statement,
// where misses hide ("Skilled Worker visa sponsorship" in a benefits list, "Visa sponsorship: Not available").
const STRONG = /(visa|work|skilled worker|employment)\s+(sponsorship|permit|visa)|sponsor\w*\s+(a\s+|your\s+|the\s+)?(visa|work)|(not|n't|cannot|unable).{0,30}sponsor|right to work|work permit/i;
const strong = args.includes("--strong");
// --holdout: the next rows in the same fixed order, after those already used to build and tune the first set.
const holdout = args.includes("--holdout");
const by = (m: string | null) => rows.filter((r) => r.model === m && (!strong || (m === null && STRONG.test(r.snippet ?? ""))));
console.log(`jobs with visa-related text: ${rows.length} (model: no=${by("no").length}, yes=${by("yes").length}, none=${by(null).length})`);
const pick = holdout
  ? (() => {
      const all = rows.filter((r) => r.snippet);
      const noList = all.filter((r) => r.model === "no"), yesList = all.filter((r) => r.model === "yes");
      const hard = all.filter((r) => r.model === null && STRONG.test(r.snippet ?? ""));
      const soft = all.filter((r) => r.model === null && !STRONG.test(r.snippet ?? ""));
      return [...noList.slice(30, 55), ...yesList.slice(20, 50), ...hard.slice(90, 90 + 45), ...soft.slice(50, 50 + 20)];
    })()
  : strong ? by(null).slice(0, N) : [...by("no").slice(0, Math.round(N * 0.3)), ...by("yes").slice(0, Math.round(N * 0.2)), ...by(null).slice(0, Math.round(N * 0.5))];
writeFileSync(flag("out", "/dev/null"), JSON.stringify(pick, null, 1));
console.log(`drew ${pick.length}`);
