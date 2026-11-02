/**
 * A tiny in-memory stand-in for the InsForge database client, covering the query shapes the app's
 * server code uses (select/insert/update/delete with eq/neq/is/not/in/gte/lt/order/limit and
 * maybeSingle/single). Each awaited query runs synchronously against the tables, so conditional
 * updates behave atomically like a single SQL statement. Not a SQL engine: it exists so tests can
 * check WHICH rows server code touches (user isolation, claim-before-send), not query planning.
 */
type Row = Record<string, unknown>;
type Result = { data: unknown; error: { message: string } | null; count: number | null };
type Pred = (r: Row) => boolean;

export type FakeDb = ReturnType<typeof createFakeDb>;

export function createFakeDb(seed: Record<string, Row[]> = {}) {
  const tables: Record<string, Row[]> = Object.fromEntries(Object.entries(seed).map(([k, v]) => [k, v.map((r) => ({ ...r }))]));
  const failures: { table: string; op: string; message: string; times: number }[] = [];
  const log: { table: string; op: string; filters: string[]; patch?: Row }[] = [];
  let seq = 0;

  /** Make the next `times` operations of this kind fail, to test error handling. */
  const failNext = (table: string, op: "select" | "insert" | "update" | "delete" | "upsert", message = "boom", times = 1) => failures.push({ table, op, message, times });

  class Query implements PromiseLike<Result> {
    private op: "select" | "insert" | "update" | "delete" | "upsert" = "select";
    private conflict: string[] = [];
    private preds: Pred[] = [];
    private descs: string[] = [];
    private patch: Row = {};
    private rows: Row[] = [];
    private one: "maybe" | "single" | null = null;
    private head = false;
    private wantCount = false;
    private returning = false;
    private sort: { col: string; asc: boolean } | null = null;
    private max = Infinity;
    constructor(private table: string) {}

    select(_cols?: string, opts?: { count?: string; head?: boolean }) {
      if (this.op === "select") { this.head = Boolean(opts?.head); this.wantCount = Boolean(opts?.count); } else this.returning = true;
      return this;
    }
    insert(rows: Row | Row[]) { this.op = "insert"; this.rows = Array.isArray(rows) ? rows : [rows]; return this; }
    upsert(rows: Row | Row[], opts?: { onConflict?: string }) { this.op = "upsert"; this.rows = Array.isArray(rows) ? rows : [rows]; this.conflict = (opts?.onConflict ?? "id").split(","); return this; }
    update(patch: Row) { this.op = "update"; this.patch = patch; return this; }
    delete() { this.op = "delete"; return this; }
    private where(desc: string, p: Pred) { this.descs.push(desc); this.preds.push(p); return this; }
    eq(col: string, v: unknown) { return this.where(`${col}=${String(v)}`, (r) => r[col] === v); }
    neq(col: string, v: unknown) { return this.where(`${col}!=${String(v)}`, (r) => r[col] !== v); }
    is(col: string, v: null | boolean) { return this.where(`${col} is ${String(v)}`, (r) => (v === null ? r[col] == null : r[col] === v)); }
    not(col: string, _op: string, v: unknown) { return this.where(`${col} not is ${String(v)}`, (r) => (v === null ? r[col] != null : r[col] !== v)); }
    in(col: string, vs: unknown[]) { return this.where(`${col} in`, (r) => vs.includes(r[col])); }
    gte(col: string, v: unknown) { return this.where(`${col}>=`, (r) => String(r[col]) >= String(v)); }
    lt(col: string, v: unknown) { return this.where(`${col}<`, (r) => String(r[col]) < String(v)); }
    ilike() { return this; }
    or() { return this; }
    order(col: string, o?: { ascending?: boolean }) { this.sort = { col, asc: o?.ascending !== false }; return this; }
    limit(n: number) { this.max = n; return this; }
    range(from: number, to: number) { this.max = to - from + 1; return this; }
    maybeSingle() { this.one = "maybe"; return this; }
    single() { this.one = "single"; return this; }

    private run(): Result {
      const table = (tables[this.table] ??= []);
      log.push({ table: this.table, op: this.op, filters: this.descs, patch: this.op === "update" ? this.patch : undefined });
      const f = failures.find((x) => x.table === this.table && x.op === this.op && x.times > 0);
      if (f) { f.times--; return { data: null, error: { message: f.message }, count: null }; }

      let hit = table.filter((r) => this.preds.every((p) => p(r)));
      if (this.op === "insert") {
        const added = this.rows.map((r) => ({ id: `row-${++seq}`, ...r }));
        table.push(...added);
        hit = added;
      } else if (this.op === "upsert") {
        hit = this.rows.map((r) => {
          const existing = table.find((t) => this.conflict.every((c) => t[c] === r[c]));
          if (existing) { Object.assign(existing, r); return existing; }
          const added = { id: `row-${++seq}`, ...r };
          table.push(added);
          return added;
        });
      } else if (this.op === "update") {
        for (const r of hit) Object.assign(r, this.patch);
      } else if (this.op === "delete") {
        tables[this.table] = table.filter((r) => !hit.includes(r));
      }
      if (this.sort) { const { col, asc } = this.sort; hit = [...hit].sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : 1) * (asc ? 1 : -1)); }
      hit = hit.slice(0, this.max).map((r) => ({ ...r }));
      const count = this.wantCount ? hit.length : null;
      const wantRows = this.op === "select" || this.returning;
      if (this.one) {
        if (this.one === "single" && hit.length !== 1) return { data: null, error: { message: "expected one row" }, count };
        return { data: wantRows ? hit[0] ?? null : null, error: null, count };
      }
      return { data: this.head ? null : wantRows ? hit : null, error: null, count };
    }
    then<A = Result, B = never>(ok?: ((v: Result) => A | PromiseLike<A>) | null, bad?: ((e: unknown) => B | PromiseLike<B>) | null) {
      return Promise.resolve().then(() => this.run()).then(ok, bad);
    }
  }

  const database = { from: (table: string) => new Query(table), rpc: async () => ({ data: null, error: null }) };
  return { database, tables, log, failNext };
}
