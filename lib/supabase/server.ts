import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { supabaseAnonKey, supabaseUrl } from "./env";

/** Cookie-bound client for the signed-in user (server components, route handlers, server actions). */
export async function createSupabaseServerClient() {
  const jar = await cookies();
  return createServerClient(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (list) => {
        // Server components can't set cookies; the proxy refreshes the session there instead.
        try { for (const { name, value, options } of list) jar.set(name, value, options); } catch { /* read-only context */ }
      },
    },
  });
}

export type SessionUser = { id: string; email: string; name: string | null };

/** The signed-in user, verified with Supabase Auth (not just decoded from the cookie), or null. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  const user = data?.user;
  if (error || !user?.email) return null;
  const meta = (user.user_metadata ?? {}) as { name?: string; full_name?: string };
  return { id: user.id, email: user.email, name: meta.name ?? meta.full_name ?? null };
}
