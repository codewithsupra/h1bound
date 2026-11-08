-- Keep the database inside the free plan (500 MB) and know when it is getting close. The previous
-- backend paused when the database reached its limit; nothing warned us.

-- Deletes expired postings nobody saved, reviewed or wrote to. Anything a user has touched is kept:
-- matches/outreach/reviews reference jobs with ON DELETE CASCADE, so a blind delete would erase a
-- user's pipeline rows.
CREATE OR REPLACE FUNCTION public.purge_stale_jobs(p_days int DEFAULT 30)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n integer;
BEGIN
  DELETE FROM public.jobs j
   WHERE j.active = false
     AND j.last_seen < now() - make_interval(days => p_days)
     AND NOT EXISTS (SELECT 1 FROM public.matches m WHERE m.job_id = j.id)
     AND NOT EXISTS (SELECT 1 FROM public.outreach o WHERE o.job_id = j.id)
     AND NOT EXISTS (SELECT 1 FROM public.reviews r WHERE r.job_id = j.id);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.purge_stale_jobs(int) FROM PUBLIC, anon, authenticated;

-- Size of the whole database in bytes, for the health check.
CREATE OR REPLACE FUNCTION public.db_size_bytes()
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$ SELECT pg_database_size(current_database()); $$;
REVOKE ALL ON FUNCTION public.db_size_bytes() FROM PUBLIC, anon, authenticated;
