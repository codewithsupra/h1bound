#!/usr/bin/env bash
# Applies every migration in supabase/migrations to a throwaway local Postgres (with a stub of
# Supabase's auth schema and roles) and runs a few checks. Needs Postgres binaries (brew install postgresql@14).
# Usage: scripts/check-migrations.sh
set -euo pipefail
PGBIN="$(dirname "$(command -v postgres)")"
DIR="$(mktemp -d)"
PORT=55432
cleanup() { "$PGBIN/pg_ctl" -D "$DIR/data" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$DIR"; }
trap cleanup EXIT
"$PGBIN/initdb" -D "$DIR/data" -U postgres --auth=trust >/dev/null
"$PGBIN/pg_ctl" -D "$DIR/data" -o "-p $PORT -k $DIR" -l "$DIR/log" start -w >/dev/null
psql() { command psql -h "$DIR" -p $PORT -U postgres -v ON_ERROR_STOP=1 -q "$@"; }
psql -d postgres -c "create database app" >/dev/null

# What Supabase provides before our migrations run.
psql -d app >/dev/null <<'SQL'
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}'::jsonb);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
SQL

# Apply with the same runner used for the real project, twice: the second run must change nothing.
export SUPABASE_DB_URL="postgresql://postgres@localhost:$PORT/app"
npx tsx scripts/db-migrate.mts
echo "re-run (should apply nothing):"
npx tsx scripts/db-migrate.mts | head -1

echo "checks:"
psql -d app -At <<'SQL'
select 'tables without RLS: ' || coalesce(string_agg(c.relname, ', '), 'none')
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
select 'public tables: ' || count(*) from pg_tables where schemaname = 'public';
select 'policies: ' || count(*) from pg_policies where schemaname = 'public';
select 'functions: ' || string_agg(proname, ', ' order by proname) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname in ('is_pro','nudge_candidates','daily_pick_candidates','delete_user_account','unsubscribe','expire_guest_sessions');
SQL

# Behaviour: a trial user is Pro, a stranger is not; a browser role cannot read or write server-only tables.
psql -d app -At <<'SQL'
insert into auth.users (id, email, raw_user_meta_data) values ('00000000-0000-0000-0000-0000000000a1', 'a@example.com', '{"name":"Asha Rao"}');
insert into profiles (user_id, trial_ends_at) values ('00000000-0000-0000-0000-0000000000a1', now() + interval '3 days');
select 'is_pro(trial user) = ' || is_pro('00000000-0000-0000-0000-0000000000a1');
select 'is_pro(stranger)  = ' || is_pro('00000000-0000-0000-0000-0000000000b2');
set role authenticated;
do $$ begin perform count(*) from sponsor_licences; raise exception 'READ ALLOWED'; exception when insufficient_privilege then raise notice 'authenticated cannot read sponsor_licences: ok'; end $$;
do $$ begin insert into sponsor_licences (country, key, name, source_date) values ('GB','x','x', now()); raise exception 'WRITE ALLOWED'; exception when insufficient_privilege then raise notice 'authenticated cannot write sponsor_licences: ok'; end $$;
reset role;
select 'daily_pick_candidates() runs: ' || (select count(*) from daily_pick_candidates());
select 'db_size_bytes() > 0: ' || (db_size_bytes() > 0);
-- purge: an old inactive job nobody saved goes; an old inactive job in someone's pipeline stays.
insert into jobs (id, source, source_id, company, title, family, location, url, active, last_seen) values
  ('00000000-0000-0000-0000-00000000f001','greenhouse','a:1','Acme','Old unsaved','other','London','https://x', false, now() - interval '60 days'),
  ('00000000-0000-0000-0000-00000000f002','greenhouse','a:2','Acme','Old but saved','other','London','https://x', false, now() - interval '60 days'),
  ('00000000-0000-0000-0000-00000000f003','greenhouse','a:3','Acme','Recent inactive','other','London','https://x', false, now() - interval '2 days');
insert into matches (user_id, job_id, score) values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000f002', 50);
select 'purge_stale_jobs(30) deleted: ' || purge_stale_jobs(30);
select 'jobs left: ' || string_agg(title, ', ' order by title) from jobs;
SQL
echo "all migrations applied and checked"
