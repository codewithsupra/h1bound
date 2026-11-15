-- "Delete all my data": removing the auth user cascades to every personal table
-- (profiles, matches, reviews, outreach, chat_messages, consents, nudge_log, billing_entitlements).
-- Admin-only; called from the server after the user confirms. Payment records held by Stripe itself are kept (tax law).
CREATE OR REPLACE FUNCTION public.delete_user_account(p_user uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM auth.users WHERE id = p_user;
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.delete_user_account(uuid) FROM PUBLIC, anon, authenticated;
