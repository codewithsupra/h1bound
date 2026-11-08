import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * A static audit of the database access rules, read from the migrations (the policies themselves
 * only run in Postgres). It replays the migrations in order and checks the FINAL state of every
 * table in the public schema, so a new table that forgets row-level security, or a policy that lets
 * a browser client write, fails the build. It does not prove the policies behave correctly in
 * Postgres; it proves nobody has written a migration that obviously weakens them.
 */

const dir = new URL("../supabase/migrations/", import.meta.url);
const sql = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort().map((f) => readFileSync(new URL(f, dir), "utf8")).join("\n");

type Policy = { table: string; name: string; cmd: string; roles: string; using: string };
const tables = new Set<string>();
const rls = new Set<string>();
const policies: Policy[] = [];
const grants: { privileges: string; table: string; roles: string }[] = [];

const norm = (s: string | undefined) => (s ?? "").replace(/\s+/g, " ").trim().toLowerCase();

type Ev = { at: number; run: () => void };
const events: Ev[] = [];
const on = (re: RegExp, run: (m: RegExpMatchArray) => void) => { for (const m of sql.matchAll(re)) events.push({ at: m.index!, run: () => run(m) }); };

// Static statements.
on(/CREATE TABLE (?:IF NOT EXISTS )?public\.(\w+)/gi, (m) => tables.add(m[1]));
on(/ALTER TABLE public\.(\w+) ENABLE ROW LEVEL SECURITY/gi, (m) => rls.add(m[1]));
on(/DROP POLICY IF EXISTS (\w+) ON public\.(\w+)/gi, (m) => { for (let i = policies.length - 1; i >= 0; i--) if (policies[i].table === m[2] && policies[i].name === m[1]) policies.splice(i, 1); });
on(/CREATE POLICY (\w+) ON public\.(\w+)\s+FOR (\w+)\s+TO ([\w, ]+?)\s+USING\s*\(([\s\S]*?)\)(?:\s+WITH CHECK\s*\([\s\S]*?\))?;/gi,
  (m) => policies.push({ name: m[1], table: m[2], cmd: m[3].toUpperCase(), roles: norm(m[4]), using: norm(m[5]) }));
on(/GRANT ([A-Z, ]+?) ON (?:TABLE )?((?:public\.\w+(?:, )?)+) TO ([\w, ]+);/g,
  (m) => { for (const t of m[2].split(",").map((x) => x.trim().replace("public.", ""))) grants.push({ privileges: norm(m[1]), table: t, roles: norm(m[3]) }); });

// Tables handled in a loop: DO $$ ... FOREACH t IN ARRAY ARRAY['a','b'] LOOP ... END LOOP; END $$;
on(/DO \$\$[\s\S]*?END \$\$;/g, (block) => {
  const body = block[0];
  const list = body.match(/ARRAY\s+ARRAY\[([^\]]+)\]/)?.[1];
  if (!list) return;
  const names = [...list.matchAll(/'(\w+)'/g)].map((x) => x[1]);
  for (const t of names) {
    if (/ENABLE ROW LEVEL SECURITY/.test(body)) rls.add(t);
    for (const p of body.matchAll(/CREATE POLICY %I ON public\.%I FOR (\w+) TO ([\w, ]+?) USING \(([\s\S]*?)\)(?: WITH CHECK \([\s\S]*?\))?'/g)) policies.push({ name: `${t}_loop`, table: t, cmd: p[1].toUpperCase(), roles: norm(p[2]), using: norm(p[3]) });
    for (const g of body.matchAll(/GRANT ([A-Z, ]+?) ON public\.%I TO ([\w, ]+?)'/g)) grants.push({ privileges: norm(g[1]), table: t, roles: norm(g[2]) });
  }
});
events.sort((a, b) => a.at - b.at).forEach((e) => e.run());

const OWN_ROW = /^(user_id|referrer_id) = \(select auth\.uid\(\)\)$/;

describe("migrations: database access rules", () => {
  it("the audit actually found the schema (a parser that matches nothing would pass vacuously)", () => {
    expect(tables.size).toBeGreaterThanOrEqual(20);
    for (const t of ["profiles", "matches", "outreach", "gmail_accounts", "sponsor_licences", "job_runs", "ai_calls", "jobs"]) expect(tables.has(t), t).toBe(true);
    expect(policies.length).toBeGreaterThanOrEqual(20);
  });

  it("every table in the public schema has row-level security", () => {
    expect([...tables].filter((t) => !rls.has(t))).toEqual([]);
  });

  it("no browser role can write to any table, whatever policies say", () => {
    const writes = policies.filter((p) => p.cmd !== "SELECT" && !(p.using === "false"));
    expect(writes.map((p) => `${p.table}.${p.name}: ${p.cmd} using ${p.using}`)).toEqual([]);
    const granted = grants.filter((g) => /insert|update|delete|all|truncate/.test(g.privileges) && /anon|authenticated|public/.test(g.roles));
    expect(granted).toEqual([]);
  });

  it("the only rows a browser role can read are its own", () => {
    const reads = policies.filter((p) => p.cmd === "SELECT" && p.using !== "false");
    const loose = reads.filter((p) => !OWN_ROW.test(p.using));
    expect(loose.map((p) => `${p.table}.${p.name}: ${p.using}`)).toEqual([]);
  });

  it("server-only data has no policy at all for browsers except a deny-all", () => {
    for (const t of ["gmail_accounts", "sponsor_licences", "company_insights", "telegram_links", "job_runs", "board_failures", "ai_calls", "jobs", "companies", "guest_sessions", "waitlist"]) {
      const mine = policies.filter((p) => p.table === t);
      expect(mine.length, t).toBeGreaterThan(0);
      expect(mine.every((p) => p.using === "false"), t).toBe(true);
    }
  });

  it("personal tables are readable by their owner only", () => {
    for (const t of ["profiles", "matches", "reviews", "outreach", "chat_messages", "consents", "nudge_log", "billing_entitlements"]) {
      const mine = policies.filter((p) => p.table === t);
      expect(mine.length, t).toBeGreaterThan(0);
      expect(mine.every((p) => p.cmd === "SELECT" && OWN_ROW.test(p.using)), t).toBe(true);
    }
  });
});
