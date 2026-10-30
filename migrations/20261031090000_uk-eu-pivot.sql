-- Pivot to UK / NL / IE sponsors + remote jobs (plan: UK/EU pivot, phase 1).

-- 1. Official sponsor registers (UK Home Office, Dutch IND, Irish DETE permits). Server-only.
CREATE TABLE IF NOT EXISTS public.sponsor_licences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country text NOT NULL CHECK (country IN ('GB', 'NL', 'IE')),
  key text NOT NULL,                        -- licenceKey(name), lib/ingest/registers.ts
  name text NOT NULL,                       -- as written on the register
  display_name text,                        -- brand name from a job board, when known
  city text,
  region text,
  routes text[] NOT NULL DEFAULT '{}',
  rating text CHECK (rating IN ('A', 'B', 'Provisional')),
  reg_id text,                              -- NL KVK number
  permits jsonb NOT NULL DEFAULT '{}'::jsonb, -- IE permits issued per year
  source_date date NOT NULL,                -- date of the register file this row came from
  listed boolean NOT NULL DEFAULT true,     -- false once it drops off the latest register
  slug text,
  board_kind text,
  board_slug text,
  board_checked_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (country, key)
);
CREATE UNIQUE INDEX IF NOT EXISTS sponsor_licences_slug_key ON public.sponsor_licences (country, slug);
CREATE INDEX IF NOT EXISTS sponsor_licences_key_idx ON public.sponsor_licences (key);
CREATE INDEX IF NOT EXISTS sponsor_licences_board_idx ON public.sponsor_licences (board_kind) WHERE board_kind IS NOT NULL;
ALTER TABLE public.sponsor_licences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sponsor_licences FROM anon, authenticated;
DROP POLICY IF EXISTS sponsor_licences_no_client_access ON public.sponsor_licences;
CREATE POLICY sponsor_licences_no_client_access ON public.sponsor_licences FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

-- 2. Jobs outside the US: country, link to the register, more ATS and remote sources.
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS country text;             -- ISO-2, null when unknown or remote-anywhere
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS licence_id uuid REFERENCES public.sponsor_licences(id) ON DELETE SET NULL;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS seniority text CHECK (seniority IN ('intern', 'graduate', 'junior', 'mid', 'senior'));
-- Where a remote job can be done from (lib/geo.ts remoteScope); null for on-site jobs.
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS remote_scope text CHECK (remote_scope IN ('anywhere', 'europe', 'country', 'us', 'unknown'));
ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_source_check;
ALTER TABLE public.jobs ADD CONSTRAINT jobs_source_check CHECK (source IN (
  'greenhouse', 'lever', 'ashby', 'workable', 'recruitee', 'teamtailor', 'personio', 'smartrecruiters', 'remotive', 'remoteok', 'himalayas'
));
CREATE INDEX IF NOT EXISTS jobs_country_family_idx ON public.jobs (country, family, posted_at DESC) WHERE active;
CREATE INDEX IF NOT EXISTS jobs_remote_family_idx ON public.jobs (family, posted_at DESC) WHERE active AND remote;
CREATE INDEX IF NOT EXISTS jobs_licence_idx ON public.jobs (licence_id);

-- 3. Work rights for UK/EU matching (US visa_status stays for existing users).
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS citizenship text;      -- ISO-2
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS visa_country text CHECK (visa_country IN ('GB', 'NL', 'IE', 'US'));
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS visa_situation text CHECK (visa_situation IN ('student', 'graduate', 'sponsored', 'none'));
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS target_countries text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.guest_sessions ADD COLUMN IF NOT EXISTS citizenship text;
ALTER TABLE public.guest_sessions ADD COLUMN IF NOT EXISTS visa_country text CHECK (visa_country IN ('GB', 'NL', 'IE', 'US'));
ALTER TABLE public.guest_sessions ADD COLUMN IF NOT EXISTS visa_situation text CHECK (visa_situation IN ('student', 'graduate', 'sponsored', 'none'));
ALTER TABLE public.guest_sessions ADD COLUMN IF NOT EXISTS target_countries text[] NOT NULL DEFAULT '{}';

-- 4. Company culture summaries from public sources, shared by all users and refreshed after 30 days.
CREATE TABLE IF NOT EXISTS public.company_insights (
  key text PRIMARY KEY,                     -- licenceKey(company)
  name text NOT NULL,
  insight jsonb NOT NULL,                   -- { summary, pros[], cons[], interviews, sources[{title,url}] }
  fetched_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.company_insights ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.company_insights FROM anon, authenticated;
DROP POLICY IF EXISTS company_insights_no_client_access ON public.company_insights;
CREATE POLICY company_insights_no_client_access ON public.company_insights FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

-- 5. Gmail send-on-approval (gmail.send scope only). Tokens are AES-GCM encrypted; never readable by clients.
CREATE TABLE IF NOT EXISTS public.gmail_accounts (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email_enc text NOT NULL CHECK (email_enc LIKE 'v1:%'),
  refresh_token_enc text NOT NULL CHECK (refresh_token_enc LIKE 'v1:%'),
  connected_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.gmail_accounts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.gmail_accounts FROM anon, authenticated;
DROP POLICY IF EXISTS gmail_accounts_no_client_access ON public.gmail_accounts;
CREATE POLICY gmail_accounts_no_client_access ON public.gmail_accounts FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

ALTER TABLE public.outreach ADD COLUMN IF NOT EXISTS sent_at timestamptz;
ALTER TABLE public.outreach ADD COLUMN IF NOT EXISTS gmail_message_id text;

-- 6. Telegram daily picks: link a chat to an account through a one-time /start token.
ALTER TABLE public.consents ADD COLUMN IF NOT EXISTS telegram_updates boolean NOT NULL DEFAULT false;
ALTER TABLE public.consents ADD COLUMN IF NOT EXISTS telegram_chat_enc text CHECK (telegram_chat_enc LIKE 'v1:%');
ALTER TABLE public.consents ADD COLUMN IF NOT EXISTS telegram_chat_hash text UNIQUE;  -- HMAC of the chat id, for webhook lookups
ALTER TABLE public.nudge_log DROP CONSTRAINT IF EXISTS nudge_log_channel_check;
ALTER TABLE public.nudge_log ADD CONSTRAINT nudge_log_channel_check CHECK (channel IN ('email', 'whatsapp', 'telegram'));

CREATE TABLE IF NOT EXISTS public.telegram_links (
  token text PRIMARY KEY CHECK (length(token) >= 24),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '30 minutes'
);
ALTER TABLE public.telegram_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.telegram_links FROM anon, authenticated;
DROP POLICY IF EXISTS telegram_links_no_client_access ON public.telegram_links;
CREATE POLICY telegram_links_no_client_access ON public.telegram_links FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

-- 7. Daily picks: everyone opted in on email or Telegram with a resume, plus when they last got picks.
CREATE OR REPLACE FUNCTION public.daily_pick_candidates()
RETURNS TABLE (
  user_id uuid, email text, name text, unsubscribe_token text, email_updates boolean,
  telegram_updates boolean, telegram_chat_enc text, last_pick timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    c.user_id, u.email, nullif(u.profile ->> 'name', ''), c.unsubscribe_token, c.email_updates,
    c.telegram_updates AND c.telegram_chat_enc IS NOT NULL, c.telegram_chat_enc,
    (SELECT max(n.sent_at) FROM public.nudge_log n WHERE n.user_id = c.user_id AND n.kind = 'daily_picks')
  FROM public.consents c
  JOIN auth.users u ON u.id = c.user_id
  JOIN public.profiles p ON p.user_id = c.user_id
  WHERE (c.email_updates OR (c.telegram_updates AND c.telegram_chat_enc IS NOT NULL))
    AND p.onboarded AND p.details_enc IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION public.daily_pick_candidates() FROM PUBLIC, anon, authenticated;
