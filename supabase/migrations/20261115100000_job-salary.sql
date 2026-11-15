-- Posted pay per job, as the posting states it (not converted). lib/salary.ts reads it to check
-- the visa salary floor; null means the posting gives no pay, which is shown as "not stated".
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS salary_min numeric,
  ADD COLUMN IF NOT EXISTS salary_max numeric,
  ADD COLUMN IF NOT EXISTS salary_currency text,
  ADD COLUMN IF NOT EXISTS salary_period text;

ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_salary_period_check;
ALTER TABLE public.jobs ADD CONSTRAINT jobs_salary_period_check
  CHECK (salary_period IS NULL OR salary_period IN ('year', 'month', 'day', 'hour'));
ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_salary_shape_check;
ALTER TABLE public.jobs ADD CONSTRAINT jobs_salary_shape_check
  CHECK ((salary_min IS NULL) = (salary_currency IS NULL) AND (salary_min IS NULL) = (salary_period IS NULL));
