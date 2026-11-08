-- companies/jobs are only read by server routes (admin key), so client roles get nothing.
-- Also stops anyone with the public anon key from bulk-scraping the dataset.
DROP POLICY IF EXISTS companies_public_read ON public.companies;
DROP POLICY IF EXISTS jobs_public_read ON public.jobs;
REVOKE ALL ON public.companies, public.jobs FROM anon, authenticated;
CREATE POLICY companies_no_client_access ON public.companies FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY jobs_no_client_access ON public.jobs FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
