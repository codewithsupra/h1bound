-- Public sponsor pages live at /sponsors/<slug>. Slugs are computed in TS (lib/slug.ts, from the
-- pretty company name) and backfilled by scripts/backfill-slugs.mts; nullable until assigned.
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS slug text;
CREATE UNIQUE INDEX IF NOT EXISTS companies_slug_key ON public.companies (slug);
