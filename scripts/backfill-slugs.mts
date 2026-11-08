/**
 * Assigns /sponsors/<slug> slugs to every company that lacks one (needs the companies-slug migration).
 * Usage: npx tsx --env-file=.env.local scripts/backfill-slugs.mts
 */
import { scriptDb } from "../lib/supabase/script";
import { fillMissingSlugs } from "../lib/ingest/slugs";

const db = scriptDb();
const n = await fillMissingSlugs(db, console.log);
console.log(`done, ${n} slugs assigned`);
