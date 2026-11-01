-- Read-only. After applying 20261101010000_parlay_compatibility.sql,
-- expect one row with true in every column.
with legs as (
  select jsonb_build_object('gameId','aaaaaaaa-0000-4000-8000-000000000001','sport','nfl',
    'pick','Team A','betType','Spread','line',-6.5,'odds',-110) as spread,
  jsonb_build_object('gameId','aaaaaaaa-0000-4000-8000-000000000001','sport','nfl',
    'pick','Team B','betType','Moneyline','line',null,'odds',150) as moneyline,
  jsonb_build_object('gameId','aaaaaaaa-0000-4000-8000-000000000001','sport','nfl',
    'pick','Over','betType','Total','line',48.5,'odds',-110) as total
)
select
  public.parlay_compatibility_error(jsonb_build_array(spread,total)) is null as spread_total_compatible,
  public.parlay_compatibility_error(jsonb_build_array(moneyline,jsonb_set(total,'{pick}','"Under"'))) is null as moneyline_total_compatible,
  public.parlay_compatibility_error(jsonb_build_array(spread,moneyline))='conflicting_side_markets' as opposite_team_side_markets_blocked,
  public.parlay_compatibility_error(jsonb_build_array(total,jsonb_set(total,'{pick}','"Under"')))='conflicting_totals' as over_under_blocked,
  public.parlay_compatibility_error(jsonb_build_array(spread,jsonb_set(spread,'{gameId}','"AAAAAAAA-0000-4000-8000-000000000001"')))='duplicate_selection' as uuid_case_duplicates_blocked,
  position('parlay_compatibility_error' in pg_get_functiondef('public.create_parlay_wager(uuid,text,numeric,uuid,bigint,numeric,numeric,numeric,jsonb)'::regprocedure))>0 as creation_uses_validation,
  not has_function_privilege('authenticated','public.create_parlay_wager(uuid,text,numeric,uuid,bigint,numeric,numeric,numeric,jsonb)','EXECUTE') as browser_cannot_impersonate
from legs;
