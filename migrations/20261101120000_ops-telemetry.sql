-- Operational evidence: every scheduled run, every failed board, every AI call. Server-only, no personal data.

CREATE TABLE IF NOT EXISTS public.job_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job text NOT NULL,                      -- refresh-jobs | refresh-feeds | registers-gb | registers-nl | daily-picks | nudges
  shard int,
  of_shards int,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  -- running for longer than the function limit means the run was killed: reports treat it as a failure.
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'ok', 'partial', 'failed')),
  boards int,                             -- ingestion: boards attempted
  failed int,                             -- ingestion: boards that failed
  jobs int,                               -- ingestion: jobs upserted
  stats jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text
);
CREATE INDEX IF NOT EXISTS job_runs_started_idx ON public.job_runs (started_at DESC);
CREATE INDEX IF NOT EXISTS job_runs_job_idx ON public.job_runs (job, started_at DESC);

CREATE TABLE IF NOT EXISTS public.board_failures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.job_runs(id) ON DELETE CASCADE,
  board text NOT NULL,                    -- "greenhouse/monzo"
  error text NOT NULL,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS board_failures_run_idx ON public.board_failures (run_id);
CREATE INDEX IF NOT EXISTS board_failures_board_idx ON public.board_failures (board, at DESC);

CREATE TABLE IF NOT EXISTS public.ai_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  at timestamptz NOT NULL DEFAULT now(),
  kind text NOT NULL,                     -- chat | rerank | resume | insight_research | insight_structure | coach
  model text NOT NULL,
  ms int NOT NULL,
  input_tokens int,
  output_tokens int,
  cost_usd numeric(10, 6),                -- as reported by the provider; null when it doesn't say
  ok boolean NOT NULL,
  error text                              -- first 200 characters, no prompt content
);
CREATE INDEX IF NOT EXISTS ai_calls_at_idx ON public.ai_calls (at DESC);
CREATE INDEX IF NOT EXISTS ai_calls_kind_idx ON public.ai_calls (kind, at DESC);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['job_runs', 'board_failures', 'ai_calls'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_no_client_access', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO anon, authenticated USING (false) WITH CHECK (false)', t || '_no_client_access', t);
  END LOOP;
END $$;
