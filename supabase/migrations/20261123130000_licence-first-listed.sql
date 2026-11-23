-- When an employer first appeared on a register we import. Rows that existed before this was tracked
-- stay null ("before tracking"), so last month's full load doesn't look like 147,000 new sponsors.
-- New inserts get the import date from the default; the weekly upsert never overwrites it.
ALTER TABLE public.sponsor_licences ADD COLUMN IF NOT EXISTS first_listed date;
ALTER TABLE public.sponsor_licences ALTER COLUMN first_listed SET DEFAULT current_date;
CREATE INDEX IF NOT EXISTS sponsor_licences_first_listed_idx ON public.sponsor_licences (country, first_listed) WHERE first_listed IS NOT NULL;
