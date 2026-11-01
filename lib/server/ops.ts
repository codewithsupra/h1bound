import "server-only";
import { createAdminInsForge } from "@/lib/insforge/admin";

/**
 * Telemetry for scheduled runs and AI calls. Everything here is best-effort: a missing table or a
 * database hiccup is logged and swallowed, because losing a data point must never fail the job or
 * the user's request it describes.
 */

const db = () => createAdminInsForge().database;
const swallow = (what: string) => (e: unknown) => console.error(`[ops] ${what}: ${(e as Error)?.message ?? e}`);

export type RunPatch = { boards?: number; failed?: number; jobs?: number; stats?: Record<string, unknown>; status?: "ok" | "partial" | "failed" };
export type Recorder = { id: string | null; failures: (board: string, error: string) => void };

/**
 * Runs `fn` as a recorded job. The run is inserted as "running" first, so a function killed by the
 * time limit leaves a visible, never-finished row instead of nothing.
 */
export async function trackRun<T>(job: string, meta: { shard?: number; of?: number }, fn: (rec: Recorder) => Promise<T>, summarize: (r: T) => RunPatch = () => ({})): Promise<T> {
  let id: string | null = null;
  try {
    const { data, error } = await db().from("job_runs").insert({ job, shard: meta.shard ?? null, of_shards: meta.of ?? null }).select("id").single();
    if (error) throw new Error(error.message);
    id = (data as { id: string }).id;
  } catch (e) { swallow("start run")(e); }

  const failures: { board: string; error: string }[] = [];
  const rec: Recorder = { id, failures: (board, error) => { if (failures.length < 200) failures.push({ board, error: error.slice(0, 300) }); } };
  try {
    const result = await fn(rec);
    const patch = summarize(result);
    const status = patch.status ?? (patch.failed && patch.boards && patch.failed >= patch.boards ? "failed" : patch.failed ? "partial" : "ok");
    await finish(id, failures, { ...patch, status });
    return result;
  } catch (e) {
    await finish(id, failures, { status: "failed" }, (e as Error).message);
    throw e;
  }
}

async function finish(id: string | null, failures: { board: string; error: string }[], patch: RunPatch, error?: string) {
  if (!id) return;
  try {
    const { stats, ...cols } = patch;
    await db().from("job_runs").update({ ...cols, ...(stats ? { stats } : {}), finished_at: new Date().toISOString(), error: error?.slice(0, 500) ?? null }).eq("id", id);
    if (failures.length) await db().from("board_failures").insert(failures.map((f) => ({ run_id: id, board: f.board, error: f.error })));
  } catch (e) { swallow("finish run")(e); }
}

type Usage = { inputTokens?: number; outputTokens?: number } | undefined;
type Meta = { openrouter?: { usage?: { cost?: number } } } | undefined;

export async function recordAi(row: { kind: string; model: string; ms: number; ok: boolean; usage?: Usage; providerMetadata?: Record<string, unknown>; error?: unknown }) {
  try {
    const cost = (row.providerMetadata as Meta)?.openrouter?.usage?.cost;
    await db().from("ai_calls").insert({
      kind: row.kind, model: row.model, ms: Math.round(row.ms), ok: row.ok,
      input_tokens: row.usage?.inputTokens ?? null, output_tokens: row.usage?.outputTokens ?? null,
      cost_usd: typeof cost === "number" ? cost : null,
      error: row.ok ? null : String((row.error as Error)?.message ?? row.error ?? "unknown").slice(0, 200),
    });
  } catch (e) { swallow("record ai")(e); }
}

/**
 * Wraps any AI SDK call (generateText, streamed results) and records latency, token counts, the
 * provider-reported cost and failures. Returns the call's own result untouched, so types are preserved.
 */
export async function tracked<R extends { usage?: unknown; providerMetadata?: unknown }>(kind: string, model: { modelId?: string }, fn: () => Promise<R>): Promise<R> {
  const started = Date.now();
  const name = model.modelId ?? "unknown";
  try {
    const result = await fn();
    void recordAi({ kind, model: name, ms: Date.now() - started, ok: true, usage: result.usage as Usage, providerMetadata: result.providerMetadata as Record<string, unknown> | undefined });
    return result;
  } catch (error) {
    await recordAi({ kind, model: name, ms: Date.now() - started, ok: false, error });
    throw error;
  }
}
