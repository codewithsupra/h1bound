-- Everything the daily nudge job needs per opted-in user, in one admin-only call.
CREATE OR REPLACE FUNCTION public.nudge_candidates()
RETURNS TABLE (
  user_id uuid, email text, first_name text, unsubscribe_token text, families text[],
  sent_at timestamptz[], sent_kinds text[], stale_applications int, jobs_shown int, last_nudge timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    c.user_id,
    u.email,
    nullif(split_part(coalesce(u.profile ->> 'name', ''), ' ', 1), ''),
    c.unsubscribe_token,
    coalesce(p.target_families, '{}'),
    coalesce((SELECT array_agg(n.sent_at) FROM public.nudge_log n WHERE n.user_id = c.user_id AND n.sent_at > now() - interval '30 days'), '{}'),
    coalesce((SELECT array_agg(n.kind) FROM public.nudge_log n WHERE n.user_id = c.user_id), '{}'),
    (SELECT count(*)::int FROM public.matches m WHERE m.user_id = c.user_id AND m.status IN ('applied', 'emailed') AND m.status_at < now() - interval '5 days'),
    (SELECT count(*)::int FROM public.matches m WHERE m.user_id = c.user_id),
    (SELECT max(n.sent_at) FROM public.nudge_log n WHERE n.user_id = c.user_id)
  FROM public.consents c
  JOIN auth.users u ON u.id = c.user_id
  LEFT JOIN public.profiles p ON p.user_id = c.user_id
  WHERE c.email_updates;
$$;
REVOKE ALL ON FUNCTION public.nudge_candidates() FROM PUBLIC, anon, authenticated;

-- One-click unsubscribe from the email footer (no login needed; the token is the credential).
CREATE OR REPLACE FUNCTION public.unsubscribe(p_token text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH u AS (
    UPDATE public.consents SET email_updates = false, updated_at = now()
     WHERE unsubscribe_token = p_token AND length(p_token) >= 32
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM u);
$$;
REVOKE ALL ON FUNCTION public.unsubscribe(text) FROM PUBLIC, anon, authenticated;
