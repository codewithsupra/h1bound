-- delete_user_account referenced auth.email_otps, a table from the previous backend that Supabase
-- does not have, so deleting any real account failed. Removing the auth user cascades to every
-- personal table; nothing else needs clearing.
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
