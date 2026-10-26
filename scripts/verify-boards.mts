/**
 * Lever/Ashby responses don't name the company, so a slug like "headway" can belong to a different
 * firm than "Headway Technologies". Keep a board only if its US job locations overlap the states
 * where that employer files H-1Bs. Usage: npx tsx --env-file=.env.local scripts/verify-boards.mts [--apply]
 */
import { createAdminClient } from "@insforge/sdk";
import { fetchBoard, type AtsKind } from "../lib/ingest/ats";
import { statesIn } from "../lib/geo";

const apply = process.argv.includes("--apply");
const db = createAdminClient({ baseUrl: process.env.NEXT_PUBLIC_INSFORGE_URL!, apiKey: process.env.INSFORGE_API_KEY! }).database;
const { data } = await db.from("companies").select("id,name,top_states,board_kind,board_slug").in("board_kind", ["lever", "ashby"]);
let dropped = 0;
for (const c of (data ?? []) as { id: string; name: string; top_states: string[]; board_kind: AtsKind; board_slug: string }[]) {
  const jobs = (await fetchBoard(c.board_kind, c.board_slug, c.name).catch(() => null)) ?? [];
  const boardStates = new Set(jobs.filter((j) => j.isUs).flatMap((j) => statesIn(j.location)));
  const overlap = c.top_states.filter((s) => boardStates.has(s));
  const ok = !c.top_states.length || !boardStates.size || overlap.length > 0;
  console.log(`${ok ? "keep" : "DROP"} ${c.name} → ${c.board_kind}/${c.board_slug}  filings in [${c.top_states.join(",")}] board in [${[...boardStates].slice(0, 6).join(",")}]`);
  if (!ok) {
    dropped++;
    if (apply) {
      await db.from("jobs").delete().eq("company_id", c.id);
      await db.from("companies").update({ board_kind: null, board_slug: null, display_name: null }).eq("id", c.id);
    }
  }
}
console.log(`${dropped} mismatched boards ${apply ? "removed" : "found (dry run)"}`);
