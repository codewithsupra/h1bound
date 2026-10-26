import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@insforge/sdk/ssr";

export async function createInsForgeServerClient() {
  return createServerClient({ cookies: await cookies() });
}

export type SessionUser = { id: string; email: string; name: string | null };

export async function getSessionUser(): Promise<SessionUser | null> {
  const insforge = await createInsForgeServerClient();
  const { data, error } = await insforge.auth.getCurrentUser();
  const user = data?.user;
  if (error || !user) return null;
  const profile = (user as { profile?: { name?: string } }).profile;
  return { id: user.id, email: user.email, name: profile?.name ?? null };
}
