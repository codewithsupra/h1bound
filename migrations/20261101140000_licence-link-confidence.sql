-- How sure we are that a job's register entry IS its employer (lib/ingest/boards.ts linkMatch):
--   exact     brand and entry name are the same once legal/regional words are removed
--   unique    brand prefixes exactly one entry
--   ambiguous other entries share the brand, so the link is shown as "possible", never "confirmed"
-- NULL on jobs = not recomputed yet (the next refresh fills it in).
ALTER TABLE public.sponsor_licences ADD COLUMN IF NOT EXISTS board_match text CHECK (board_match IN ('exact', 'unique', 'ambiguous'));
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS licence_match text CHECK (licence_match IN ('exact', 'unique', 'ambiguous'));
