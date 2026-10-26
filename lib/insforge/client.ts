"use client";

import { createBrowserClient } from "@insforge/sdk/ssr";

type BrowserClient = ReturnType<typeof createBrowserClient>;
let client: BrowserClient | null = null;

/**
 * Created on first use rather than at import, so guest pages never trigger a
 * session refresh they can't satisfy.
 */
export function getInsforge(): BrowserClient {
  if (!client) client = createBrowserClient();
  return client;
}
