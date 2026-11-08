-- Try-before-signup: anonymous guests chat with Maya and see up to 5 jobs.
-- Server-only (no client grants): identified by a signed httpOnly cookie, read/written via the
-- admin key after the server verifies that cookie. Encrypted like profiles. Expires after 7 days;
-- on signup/sign-in the guest's profile, chat and shown jobs move into the user's tables.
CREATE TABLE public.guest_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_hash text NOT NULL,
  details_enc text CHECK (details_enc LIKE 'v1:%'),
  skills text[] NOT NULL DEFAULT '{}',
  target_families text[] NOT NULL DEFAULT '{}',
  years_experience int NOT NULL DEFAULT 0 CHECK (years_experience BETWEEN 0 AND 60),
  visa_status text,
  needs_sponsorship boolean NOT NULL DEFAULT true,
  wants_remote text NOT NULL DEFAULT 'any' CHECK (wants_remote IN ('remote', 'hybrid', 'onsite', 'any')),
  locations text[] NOT NULL DEFAULT '{}',
  onboarded boolean NOT NULL DEFAULT false,
  shown_job_ids uuid[] NOT NULL DEFAULT '{}',
  chat_enc text CHECK (chat_enc LIKE 'v1:%'),   -- encrypted JSON array of UI messages (last 40)
  messages_today int NOT NULL DEFAULT 0,
  day date NOT NULL DEFAULT current_date,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX guest_sessions_ip_idx ON public.guest_sessions (ip_hash, created_at DESC);
CREATE INDEX guest_sessions_seen_idx ON public.guest_sessions (last_seen);

ALTER TABLE public.guest_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.guest_sessions FROM anon, authenticated;
CREATE POLICY guest_sessions_no_client_access ON public.guest_sessions FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

-- Housekeeping, called from the daily cron.
CREATE OR REPLACE FUNCTION public.expire_guest_sessions()
RETURNS int
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH d AS (DELETE FROM public.guest_sessions WHERE last_seen < now() - interval '7 days' RETURNING 1)
  SELECT count(*)::int FROM d;
$$;
REVOKE ALL ON FUNCTION public.expire_guest_sessions() FROM PUBLIC, anon, authenticated;
