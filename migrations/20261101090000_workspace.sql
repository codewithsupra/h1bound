-- Signed-in workspace: pipeline notes, reply check-ins, daily-pick settings, visa clock, email tone.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS picks_per_day int NOT NULL DEFAULT 5 CHECK (picks_per_day BETWEEN 3 AND 15);
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS picks_hour int NOT NULL DEFAULT 8 CHECK (picks_hour BETWEEN 0 AND 23);
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'Europe/London';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email_tone text NOT NULL DEFAULT 'warm' CHECK (email_tone IN ('plain', 'warm', 'direct'));
-- End of a student / post-study visa, for the visa clock and sponsor-first sorting. Not identifying on its own.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS visa_ends_on date;

-- Private notes per job (encrypted) and when we last asked "did they reply?".
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS notes_enc text CHECK (notes_enc LIKE 'v1:%');
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS asked_reply_at timestamptz;
CREATE INDEX IF NOT EXISTS matches_user_status_idx ON public.matches (user_id, status, status_at DESC);

ALTER TABLE public.consents ADD COLUMN IF NOT EXISTS picks_paused boolean NOT NULL DEFAULT false;

-- Daily picks now run hourly and pick users whose local delivery hour it is.
DROP FUNCTION IF EXISTS public.daily_pick_candidates();
CREATE FUNCTION public.daily_pick_candidates()
RETURNS TABLE (
  user_id uuid, email text, name text, unsubscribe_token text, email_updates boolean,
  telegram_updates boolean, telegram_chat_enc text, last_pick timestamptz,
  picks_per_day int, picks_hour int, timezone text, visa_ends_on date
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    c.user_id, u.email, nullif(u.profile ->> 'name', ''), c.unsubscribe_token, c.email_updates,
    c.telegram_updates AND c.telegram_chat_enc IS NOT NULL, c.telegram_chat_enc,
    (SELECT max(n.sent_at) FROM public.nudge_log n WHERE n.user_id = c.user_id AND n.kind = 'daily_picks'),
    p.picks_per_day, p.picks_hour, p.timezone, p.visa_ends_on
  FROM public.consents c
  JOIN auth.users u ON u.id = c.user_id
  JOIN public.profiles p ON p.user_id = c.user_id
  WHERE NOT c.picks_paused
    AND (c.email_updates OR (c.telegram_updates AND c.telegram_chat_enc IS NOT NULL))
    AND p.onboarded AND p.details_enc IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION public.daily_pick_candidates() FROM PUBLIC, anon, authenticated;
