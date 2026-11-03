select
  to_regclass('public.wager_records') is not null as records_view_exists,
  to_regclass('public.game_voids') is not null as void_audit_exists,
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='parlay_wagers' and column_name='pricing_method') as pricing_method_exists,
  has_function_privilege('service_role','public.create_single_wager(uuid,uuid,jsonb)','EXECUTE') as server_can_create_singles,
  not has_function_privilege('authenticated','public.create_single_wager(uuid,uuid,jsonb)','EXECUTE') as browser_cannot_impersonate,
  not has_function_privilege('anon','public.score_game(uuid)','EXECUTE') as anonymous_cannot_score,
  not has_function_privilege('authenticated','public.settle_parlay_legs(uuid)','EXECUTE') as browser_cannot_settle,
  (select relrowsecurity from pg_class where oid='public.parlay_wagers'::regclass) as parent_rls_enabled,
  (select relrowsecurity from pg_class where oid='public.parlay_legs'::regclass) as leg_rls_enabled,
  exists(select 1 from pg_trigger where tgrelid='public.games'::regclass and tgname='settle_game_parlays') as settlement_trigger_exists,
  not exists(select 1 from pg_constraint c where conrelid='public.picks'::regclass and contype='u'
    and (select array_agg(a.attname::text order by a.attname) from unnest(c.conkey) k
    join pg_attribute a on a.attrelid=c.conrelid and a.attnum=k)=array['game_id','user_id']) as game_level_unique_constraint_removed;
