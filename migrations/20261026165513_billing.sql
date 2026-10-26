-- Billing: Stripe subscriptions → app-owned entitlements (adapted from Lull).
-- Entitlements are written only by the webhook_events trigger; success URLs grant nothing.

-- ---------- 1. Lock down Stripe runtime tables to the caller's own billing subject ----------
ALTER TABLE payments.stripe_checkout_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments.stripe_customer_portal_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY h1b_checkout_insert_own ON payments.stripe_checkout_sessions FOR INSERT TO authenticated
  WITH CHECK (subject_type = 'user' AND subject_id = (SELECT auth.uid())::text);
CREATE POLICY h1b_checkout_select_own ON payments.stripe_checkout_sessions FOR SELECT TO authenticated
  USING (subject_type = 'user' AND subject_id = (SELECT auth.uid())::text);
CREATE POLICY h1b_portal_insert_own ON payments.stripe_customer_portal_sessions FOR INSERT TO authenticated
  WITH CHECK (subject_type = 'user' AND subject_id = (SELECT auth.uid())::text);
CREATE POLICY h1b_portal_select_own ON payments.stripe_customer_portal_sessions FOR SELECT TO authenticated
  USING (subject_type = 'user' AND subject_id = (SELECT auth.uid())::text);

-- ---------- 2. App-owned entitlement state (written only by the webhook trigger) ----------
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

-- ---------- 3. Pure mapping: Stripe subscription event payload → entitlement fields ----------
-- current_period_end moved onto subscription items in newer Stripe API versions; read both.
CREATE OR REPLACE FUNCTION public.stripe_subscription_state(p_payload jsonb)
RETURNS TABLE (subject_type text, subject_id text, status text, price_id text, plan_interval text,
               current_period_end timestamptz, cancel_at timestamptz, subscription_id text, event_at timestamptz)
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT
    o -> 'metadata' ->> 'insforge_subject_type',
    o -> 'metadata' ->> 'insforge_subject_id',
    o ->> 'status',
    o -> 'items' -> 'data' -> 0 -> 'price' ->> 'id',
    o -> 'items' -> 'data' -> 0 -> 'price' -> 'recurring' ->> 'interval',
    to_timestamp(coalesce(o ->> 'current_period_end', o -> 'items' -> 'data' -> 0 ->> 'current_period_end')::bigint),
    to_timestamp((o ->> 'cancel_at')::bigint),
    o ->> 'id',
    to_timestamp((p_payload ->> 'created')::bigint)
  FROM (SELECT p_payload -> 'data' -> 'object' AS o) s;
$$;
REVOKE ALL ON FUNCTION public.stripe_subscription_state(jsonb) FROM PUBLIC, anon, authenticated;

-- ---------- 4. Fulfillment trigger (idempotent, order-safe via last_event_at; skips unknown users) ----------
CREATE OR REPLACE FUNCTION public.h1b_fulfill_stripe_subscription()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s record;
  v_user uuid;
BEGIN
  IF NEW.provider <> 'stripe' OR NEW.processing_status <> 'processed'
     OR NEW.event_type NOT IN ('customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted',
                               'customer.subscription.paused', 'customer.subscription.resumed') THEN
    RETURN NEW;
  END IF;

  SELECT * INTO s FROM public.stripe_subscription_state(NEW.payload);

  IF s.subject_id IS NULL THEN
    SELECT m.subject_type, m.subject_id INTO s.subject_type, s.subject_id
      FROM payments.customer_mappings m
     WHERE m.provider = 'stripe' AND m.environment = NEW.environment
       AND m.provider_customer_id = NEW.payload -> 'data' -> 'object' ->> 'customer';
  END IF;

  IF s.subject_type IS DISTINCT FROM 'user' OR s.subject_id IS NULL
     OR s.subject_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RAISE WARNING 'h1b: stripe event % has no resolvable user subject', NEW.provider_event_id;
    RETURN NEW;
  END IF;
  v_user := s.subject_id::uuid;

  -- Deleted or unknown accounts must never make webhook processing fail (FK would raise and retry forever).
  IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = v_user) THEN
    RAISE WARNING 'h1b: stripe event % references unknown user', NEW.provider_event_id;
    RETURN NEW;
  END IF;

  INSERT INTO public.billing_entitlements AS e
    (user_id, provider, environment, status, price_id, plan_interval, current_period_end, cancel_at, provider_subscription_id, last_event_at, updated_at)
  VALUES
    (v_user, 'stripe', NEW.environment,
     CASE WHEN NEW.event_type = 'customer.subscription.deleted' THEN 'canceled' ELSE s.status END,
     s.price_id, s.plan_interval, s.current_period_end, s.cancel_at, s.subscription_id, coalesce(s.event_at, now()), now())
  ON CONFLICT (user_id) DO UPDATE SET
    provider = EXCLUDED.provider,
    environment = EXCLUDED.environment,
    status = EXCLUDED.status,
    price_id = EXCLUDED.price_id,
    plan_interval = EXCLUDED.plan_interval,
    current_period_end = EXCLUDED.current_period_end,
    cancel_at = EXCLUDED.cancel_at,
    provider_subscription_id = EXCLUDED.provider_subscription_id,
    last_event_at = EXCLUDED.last_event_at,
    updated_at = now()
  -- Out-of-order safety: never let an older event overwrite newer state.
  WHERE e.last_event_at <= EXCLUDED.last_event_at;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.h1b_fulfill_stripe_subscription() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER h1b_fulfill_stripe_subscription
  AFTER INSERT OR UPDATE OF processing_status ON payments.webhook_events
  FOR EACH ROW EXECUTE FUNCTION public.h1b_fulfill_stripe_subscription();

-- ---------- 5. Single source of truth for "is this user Pro right now?" ----------
-- Active/trialing, or past_due within a 3-day grace window. p_user lets server code ask for a user.
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
