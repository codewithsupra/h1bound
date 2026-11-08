import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseServiceKey, supabaseUrl } from "./env";

/** The untyped client: the app casts query results where it needs types. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = SupabaseClient<any, "public", any>;

let client: Db | null = null;

/**
 * Full-access client (service role: bypasses row-level security). Personal tables are SELECT-only
 * for browser roles, so every write (profile, matches, reviews, outreach, chat history) goes through
 * this after the route has checked auth and quota. Never import this from a client component.
 */
export function adminDb(): Db {
  return (client ??= createClient(supabaseUrl(), supabaseServiceKey(), { auth: { persistSession: false, autoRefreshToken: false } }));
}
