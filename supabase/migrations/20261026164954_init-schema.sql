-- H1Bound core schema.
-- Public reference data (companies, jobs) is readable by everyone and written only by the server
-- (admin key). Personal tables cascade from auth.users, are readable by their owner only, and are
-- written only by server routes after auth + quota checks, so a user can't reset their own quota.
-- Identity fields are AES-256-GCM ciphertext (`*_enc`, prefix 'v1:'), encrypted in lib/crypto.ts.

-- ---------- Reference data ----------
CREATE TABLE public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,                 -- normalizeEmployer(legal name)
  name text NOT NULL,                       -- legal name as filed with DOL
  display_name text,                        -- brand name from a job board, when known
  dba text,
  top_states text[] NOT NULL DEFAULT '{}',
  fiscal_year int NOT NULL,
  total_filings int NOT NULL DEFAULT 0,
  by_family jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_filed date,
  board_kind text CHECK (board_kind IN ('greenhouse', 'lever', 'ashby')),
  board_slug text,
  board_checked_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX companies_total_idx ON public.companies (total_filings DESC);
CREATE INDEX companies_board_idx ON public.companies (board_kind) WHERE board_kind IS NOT NULL;

CREATE TABLE public.jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL CHECK (source IN ('greenhouse', 'lever', 'ashby')),
  source_id text NOT NULL,
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  company text NOT NULL,
  title text NOT NULL,
  family text NOT NULL,
  location text NOT NULL DEFAULT '',
  remote boolean NOT NULL DEFAULT false,
  is_us boolean NOT NULL DEFAULT false,
  url text NOT NULL,
  description text NOT NULL DEFAULT '',
  posted_at timestamptz,
  jd_sponsorship text CHECK (jd_sponsorship IN ('yes', 'no')),
  active boolean NOT NULL DEFAULT true,
  first_seen timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source, source_id)
);
CREATE INDEX jobs_active_family_idx ON public.jobs (family, posted_at DESC) WHERE active AND is_us;
CREATE INDEX jobs_company_idx ON public.jobs (company_id);

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.companies, public.jobs FROM anon, authenticated;
GRANT SELECT ON public.companies, public.jobs TO anon, authenticated;
CREATE POLICY companies_public_read ON public.companies FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY jobs_public_read ON public.jobs FOR SELECT TO anon, authenticated USING (true);

-- ---------- Personal data ----------
CREATE TABLE public.profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Identity + resume details (name, contact, education, employers, resume text): encrypted JSON.
  details_enc text CHECK (details_enc LIKE 'v1:%'),
  -- Matching fields: not identifying on their own, kept plain so ranking is cheap.
  skills text[] NOT NULL DEFAULT '{}',
  target_families text[] NOT NULL DEFAULT '{}',
  years_experience int NOT NULL DEFAULT 0 CHECK (years_experience BETWEEN 0 AND 60),
  visa_status text CHECK (visa_status IN ('f1_opt', 'f1_stem_opt', 'f1_student', 'h1b', 'h4_ead', 'outside_us', 'citizen_or_gc', 'other')),
  needs_sponsorship boolean NOT NULL DEFAULT true,
  wants_remote text NOT NULL DEFAULT 'any' CHECK (wants_remote IN ('remote', 'hybrid', 'onsite', 'any')),
  locations text[] NOT NULL DEFAULT '{}',
  onboarded boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- A job counts against the free quota the first time it is shown (row created).
CREATE TABLE public.matches (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  score int NOT NULL,
  reasons text[] NOT NULL DEFAULT '{}',
  why text,
  status text NOT NULL DEFAULT 'shown' CHECK (status IN ('shown', 'saved', 'applied', 'emailed', 'replied', 'interview', 'offer', 'rejected', 'dismissed')),
  shown_at timestamptz NOT NULL DEFAULT now(),
  status_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, job_id)
);
CREATE INDEX matches_job_idx ON public.matches (job_id);

CREATE TABLE public.reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  feedback_enc text NOT NULL CHECK (feedback_enc LIKE 'v1:%'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX reviews_user_idx ON public.reviews (user_id, job_id);
CREATE INDEX reviews_job_idx ON public.reviews (job_id);

-- Pro outputs per job: cold email (+ contact), interview plan, tailoring tips, follow-ups.
CREATE TABLE public.outreach (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('cold_email', 'interview_plan', 'tailoring', 'follow_up')),
  body_enc text NOT NULL CHECK (body_enc LIKE 'v1:%'),  -- includes any contact name/email found
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX outreach_user_idx ON public.outreach (user_id, job_id, kind);
CREATE INDEX outreach_job_idx ON public.outreach (job_id);

CREATE TABLE public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message_enc text NOT NULL CHECK (message_enc LIKE 'v1:%'),  -- one UI message (role + parts) as JSON
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX chat_messages_user_idx ON public.chat_messages (user_id, created_at);

CREATE TABLE public.consents (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email_updates boolean NOT NULL DEFAULT false,
  whatsapp_updates boolean NOT NULL DEFAULT false,
  phone_enc text CHECK (phone_enc LIKE 'v1:%'),
  unsubscribe_token text NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.nudge_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  channel text NOT NULL CHECK (channel IN ('email', 'whatsapp')),
  sent_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX nudge_log_user_idx ON public.nudge_log (user_id, sent_at DESC);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['profiles', 'matches', 'reviews', 'outreach', 'chat_messages', 'consents', 'nudge_log'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()))', t || '_read_own', t);
  END LOOP;
END $$;
