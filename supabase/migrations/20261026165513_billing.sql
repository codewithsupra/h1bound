-- Billing: app-owned entitlements. Pro is granted only by a server-side Stripe webhook writing this
-- table with the service role; a success URL grants nothing. (The webhook route is not built yet, so
-- no one is Pro except through the 7-day trial in profiles.trial_ends_at.)

CREATE TABLE public.billing_entitlements (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('stripe', 'razorpay')),
  environment text NOT NULL CHECK (environment IN ('test', 'live')),
  status text NOT NULL,
  price_id text,
  plan_interval text CHECK (plan_interval IN ('month', 'year')),
  current_period_end timestamptz,
  cancel_at timestamptz,
  provider_subscription_id text,
  last_event_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.billing_entitlements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.billing_entitlements FROM anon, authenticated;
GRANT SELECT ON public.billing_entitlements TO authenticated;
CREATE POLICY billing_entitlements_read_own ON public.billing_entitlements FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));

-- Single source of truth for "is this user Pro right now?" (the trial is added in a later migration).
-- Active/trialing, or past_due within a 3-day grace window.
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
  );
$$;
REVOKE ALL ON FUNCTION public.is_pro(uuid) FROM PUBLIC, anon, authenticated;
