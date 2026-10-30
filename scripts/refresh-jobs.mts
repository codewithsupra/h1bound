/** Usage: npx tsx --env-file=.env.local scripts/refresh-jobs.mts [--feeds] */
import { createAdminClient } from "@insforge/sdk";
import { refreshAll, refreshFeeds } from "../lib/ingest/refresh";

const db = createAdminClient({ baseUrl: process.env.NEXT_PUBLIC_INSFORGE_URL!, apiKey: process.env.INSFORGE_API_KEY! }).database;
console.log(process.argv.includes("--feeds") ? await refreshFeeds(db, { log: console.log }) : await refreshAll(db, { log: console.log }));
