-- Direct Stripe subscriptions (lib/server/stripe.ts, app/api/billing/*).
-- billing_customers: which Stripe Customer belongs to which user, so webhook events resolve through
-- Stripe's own object graph (subscription -> customer -> user) instead of trusting metadata.
-- billing_events: every webhook event id we've applied, so Stripe's retries are processed once.
-- Both are server-only: written with the service role, never readable from the browser.

CREATE TABLE IF NOT EXISTS public.billing_customers (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  provider_customer_id text NOT NULL UNIQUE,
  environment text NOT NULL CHECK (environment IN ('test', 'live')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.billing_events (
  id text PRIMARY KEY,
  type text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.billing_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.billing_customers, public.billing_events FROM anon, authenticated;
DROP POLICY IF EXISTS billing_customers_no_client_access ON public.billing_customers;
CREATE POLICY billing_customers_no_client_access ON public.billing_customers FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS billing_events_no_client_access ON public.billing_events;
CREATE POLICY billing_events_no_client_access ON public.billing_events FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
