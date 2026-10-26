import "server-only";
import { createAdminClient } from "@insforge/sdk";

/**
 * Full-access client. Personal tables are SELECT-only for users, so every write (profile, matches,
 * reviews, outreach, chat history) goes through this after the route has checked auth + quota.
 * Never import this from a client component.
 */
export function createAdminInsForge() {
  return createAdminClient({ baseUrl: process.env.NEXT_PUBLIC_INSFORGE_URL!, apiKey: process.env.INSFORGE_API_KEY! });
}
