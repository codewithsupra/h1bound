/**
 * One-off: read posted pay from the stored descriptions of active jobs (the daily refresh then adds
 * the boards' own salary fields). Run: npx tsx --env-file=.env.local scripts/backfill-salary.mts
 */
import { scriptDb } from "@/lib/supabase/script";
import { fetchAll } from "@/lib/supabase/page";
import { parseSalaryText } from "@/lib/salary";

const db = scriptDb();
const rows = await fetchAll<{ id: string; description: string }>((from, to) => db.from("jobs").select("id,description").eq("active", true).is("salary_min", null).range(from, to));
const hits = rows.flatMap((r) => { const s = parseSalaryText(r.description); return s ? [{ id: r.id, s }] : []; });
let done = 0;
for (let i = 0; i < hits.length; i += 25) {
  await Promise.all(hits.slice(i, i + 25).map(async ({ id, s }) => {
    const { error } = await db.from("jobs").update({ salary_min: s.min, salary_max: s.max, salary_currency: s.currency, salary_period: s.period }).eq("id", id);
    if (error) throw new Error(error.message);
    done++;
  }));
}
console.log({ scanned: rows.length, withSalary: done });
