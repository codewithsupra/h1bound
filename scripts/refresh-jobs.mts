/** Usage: npx tsx --env-file=.env.local scripts/refresh-jobs.mts [--feeds] */
import { scriptDb } from "../lib/supabase/script";
import { refreshAll, refreshFeeds } from "../lib/ingest/refresh";

const db = scriptDb();
console.log(process.argv.includes("--feeds") ? await refreshFeeds(db, { log: console.log }) : await refreshAll(db, { log: console.log }));
