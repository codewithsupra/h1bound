/**
 * Assigns /sponsors/<slug> slugs to every company that lacks one (needs the companies-slug migration).
 * Usage: npx tsx --env-file=.env.local scripts/backfill-slugs.mts
 */
import { createAdminClient } from "@insforge/sdk";
import { fillMissingSlugs } from "../lib/ingest/slugs";

const db = createAdminClient({ baseUrl: process.env.NEXT_PUBLIC_INSFORGE_URL!, apiKey: process.env.INSFORGE_API_KEY! }).database;
const n = await fillMissingSlugs(db, console.log);
console.log(`done, ${n} slugs assigned`);
