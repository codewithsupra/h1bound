-- Growth round: invite-a-friend rewards, a 7-day no-card Pro trial, and the WhatsApp waitlist.

-- ---------- 1. Profiles: referral code + trial window (server-written only; clients can only SELECT) ----------
ALTER TABLE public.profiles
  ADD COLUMN referral_code text NOT NULL UNIQUE DEFAULT substr(replace(gen_random_uuid()::text, '-', ''), 1, 10),
  ADD COLUMN trial_ends_at timestamptz;

-- ---------- 2. Referrals: one row per referred account; reward counts once the friend uploads a resume ----------
CREATE TABLE public.referrals (
  referred_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  referrer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  activated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (referred_id <> referrer_id)
);
CREATE INDEX referrals_referrer_idx ON public.referrals (referrer_id) WHERE activated_at IS NOT NULL;

ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.referrals FROM anon, authenticated;
GRANT SELECT ON public.referrals TO authenticated;
CREATE POLICY referrals_read_own ON public.referrals FOR SELECT TO authenticated USING (referrer_id = (SELECT auth.uid()));

-- ---------- 3. WhatsApp waitlist: email encrypted like other PII, keyed by an HMAC for dedupe ----------
CREATE TABLE public.waitlist (
  email_hash text PRIMARY KEY,
  email_enc text NOT NULL CHECK (email_enc LIKE 'v1:%'),
  channel text NOT NULL CHECK (channel IN ('whatsapp')),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.waitlist FROM anon, authenticated;
CREATE POLICY waitlist_no_client_access ON public.waitlist FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

-- ---------- 4. is_pro: a paid entitlement OR an unexpired trial ----------
CREATE OR REPLACE FUNCTION public.is_pro(p_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.billing_entitlements e
     WHERE e.user_id = p_user
       AND (e.status IN ('active', 'trialing')
            OR (e.status = 'past_due' AND now() < coalesce(e.current_period_end, now()) + interval '3 days'))
  ) OR EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.user_id = p_user AND p.trial_ends_at > now()
  );
$$;
REVOKE ALL ON FUNCTION public.is_pro(uuid) FROM PUBLIC, anon, authenticated;
