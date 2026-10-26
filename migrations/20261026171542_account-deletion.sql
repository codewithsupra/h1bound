-- "Delete all my data": removing the auth user cascades to every personal table
-- (profiles, matches, reviews, outreach, chat_messages, consents, nudge_log, billing_entitlements).
-- Admin-only; called from the server after the user confirms. Stripe's payments.* ledger is kept (tax law).
CREATE OR REPLACE FUNCTION public.delete_user_account(p_user uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_email text;
BEGIN
  SELECT email INTO v_email FROM auth.users WHERE id = p_user;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  DELETE FROM auth.email_otps WHERE lower(email) = lower(v_email);
  DELETE FROM auth.users WHERE id = p_user;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.delete_user_account(uuid) FROM PUBLIC, anon, authenticated;
