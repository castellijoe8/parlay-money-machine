-- Read-only: run after 20261101020000_social_parlay_payout.sql.
-- Expected: one row, all seven columns true. No wagers are inserted or settled.
with definitions as (
 select pg_get_functiondef('public.create_parlay_wager(uuid,text,numeric,uuid,bigint,numeric,numeric,numeric,jsonb)'::regprocedure) as creation,
        pg_get_functiondef('public.settle_parlay_legs(uuid)'::regprocedure) as settlement
), legs as (
 select jsonb_build_object('gameId','aaaaaaaa-0000-4000-8000-000000000001','sport','nfl','pick','Miami','betType','Moneyline','line',null,'odds',-150) as side,
        jsonb_build_object('gameId','aaaaaaaa-0000-4000-8000-000000000001','sport','nfl','pick','Over','betType','Total','line',44.5,'odds',-110) as total
)
select
 position('house_decimal_product_v1' in creation)>0 as house_payout_creation_installed,
 position('sgp_pricing_unavailable' in creation)=0 as same_game_price_block_removed,
 position('house_decimal_product_v1' in settlement)>0 as frozen_house_settlement_installed,
 public.parlay_compatibility_error(jsonb_build_array(side,total)) is null as moneyline_over_compatible,
 round((1+100::numeric/150)*(1+100::numeric/110),2)=3.18 as miami_example_returns_3_18,
 has_function_privilege('service_role','public.create_parlay_wager(uuid,text,numeric,uuid,bigint,numeric,numeric,numeric,jsonb)','EXECUTE') as server_can_create,
 not has_function_privilege('authenticated','public.create_parlay_wager(uuid,text,numeric,uuid,bigint,numeric,numeric,numeric,jsonb)','EXECUTE') as browser_cannot_impersonate
from definitions cross join legs;
