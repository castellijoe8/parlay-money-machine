-- Read-only: run in this project's Supabase SQL Editor and review the results.
-- This does not create tables, change policies, or score picks.
begin transaction read only;

-- Diagnose observed permission-denied responses without changing grants or RLS.
select t.tablename, r.role_name,
       has_table_privilege(r.role_name, format('public.%I', t.tablename), 'SELECT') as can_select,
       has_table_privilege(r.role_name, format('public.%I', t.tablename), 'INSERT') as can_insert,
       has_table_privilege(r.role_name, format('public.%I', t.tablename), 'UPDATE') as can_update
from pg_tables t
cross join (values ('anon'), ('authenticated'), ('service_role')) as r(role_name)
where t.schemaname = 'public'
  and t.tablename in ('profiles', 'games', 'picks', 'sync_state')
order by t.tablename, r.role_name;

-- Confirm required columns and types against the application queries.
select table_name, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in ('profiles', 'games', 'picks', 'sync_state')
order by table_name, ordinal_position;

-- RLS should be enabled on all four public tables.
select relname as table_name, relrowsecurity as rls_enabled
from pg_class
where oid in (
  to_regclass('public.profiles'), to_regclass('public.games'),
  to_regclass('public.picks'), to_regclass('public.sync_state')
);

-- Check that readers cannot alter other users' profiles or picks, set results,
-- change odds, write games, or write sync_state. Leaderboards need pick reads.
select tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('profiles', 'games', 'picks', 'sync_state')
order by tablename, policyname;

-- Verify uniqueness (including user/game), relationships, and validation.
select conrelid::regclass as table_name, conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid in (
  to_regclass('public.profiles'), to_regclass('public.games'),
  to_regclass('public.picks'), to_regclass('public.sync_state')
);

-- Review trigger functions for kickoff enforcement and normalization of bet_type.
select c.relname as table_name, t.tgname, pg_get_triggerdef(t.oid) as trigger_definition,
       pg_get_functiondef(t.tgfoid) as function_definition
from pg_trigger t join pg_class c on c.oid = t.tgrelid
where not t.tgisinternal
  and t.tgrelid in (to_regclass('public.picks'), to_regclass('public.profiles'));

-- score_game must accept game_id_input, be safe to repeat, and be executable
-- by service_role only, not anon/authenticated (including via PUBLIC grants).
select p.oid::regprocedure as function_name, p.proargnames, p.prosecdef,
       p.proconfig, p.proacl, pg_get_functiondef(p.oid) as definition,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as user_can_execute,
       has_function_privilege('service_role', p.oid, 'EXECUTE') as server_can_execute
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'score_game';

commit;

-- Once the columns above are confirmed, run separately:
-- select key, last_run_at from public.sync_state where key in ('odds', 'scores');
