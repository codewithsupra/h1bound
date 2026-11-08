/**
 * Applies supabase/migrations/*.sql, in order, to the database in SUPABASE_DB_URL, skipping any already
 * applied (tracked in app_migrations.applied, a schema the API does not expose). Each file runs in one
 * transaction, so a failure leaves the database as it was. Safe to re-run.
 *
 * SUPABASE_DB_URL: Supabase dashboard -> Connect -> "Session pooler" connection string (works over IPv4).
 * Usage: npx tsx --env-file=.env.local scripts/db-migrate.mts [--dry]
 */
import { readdirSync, readFileSync } from "node:fs";
import pg from "pg";

const url = process.env.SUPABASE_DB_URL;
if (!url) { console.error("Set SUPABASE_DB_URL (run with --env-file=.env.local)"); process.exit(1); }
const dry = process.argv.includes("--dry");
const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);

const dir = new URL("../supabase/migrations/", import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

const client = new pg.Client({ connectionString: url, ssl: local ? false : { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query("create schema if not exists app_migrations; create table if not exists app_migrations.applied (name text primary key, applied_at timestamptz not null default now())");
  const done = new Set((await client.query<{ name: string }>("select name from app_migrations.applied")).rows.map((r) => r.name));
  const pending = files.filter((f) => !done.has(f));
  console.log(`${files.length} migrations, ${done.size} applied, ${pending.length} pending`);
  for (const f of pending) {
    if (dry) { console.log(`would apply ${f}`); continue; }
    process.stdout.write(`applying ${f} ... `);
    await client.query("begin");
    try {
      await client.query(readFileSync(new URL(f, dir), "utf8"));
      await client.query("insert into app_migrations.applied (name) values ($1)", [f]);
      await client.query("commit");
      console.log("ok");
    } catch (e) {
      await client.query("rollback");
      console.log("FAILED");
      throw e;
    }
  }
} finally {
  await client.end();
}
