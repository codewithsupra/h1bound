#!/usr/bin/env bash
# Copies the Supabase values from .env.local to this project's Vercel Production environment.
# The values are piped to the Vercel CLI and never printed. Run it yourself: it uses your Vercel login.
# Usage: scripts/push-env-to-vercel.sh
set -euo pipefail
cd "$(dirname "$0")/.."
for k in NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY; do
  v=$(grep -E "^$k=" .env.local | cut -d= -f2- | tr -d "\"' ")
  if [ -z "$v" ]; then echo "missing $k in .env.local"; exit 1; fi
  # The service role key bypasses row-level security: store it as a sensitive (write-only) variable.
  # The URL and the publishable key are public by design (they ship to the browser), so they stay readable.
  flags=(--no-sensitive)
  [ "$k" = "SUPABASE_SERVICE_ROLE_KEY" ] && flags=(--sensitive)
  printf '%s' "$v" | npx vercel env add "$k" production --force "${flags[@]}" >/dev/null
  echo "set $k"
done
echo "done. Redeploy for the new values to take effect."
