begin;

-- Additive validation-only change: no wagers, prices, settlement or tables rewritten.
-- Codes match COMPATIBILITY_MESSAGES in lib/betting.ts; parity is tested.
create or replace function public.parlay_compatibility_error(p_legs jsonb)
returns text language plpgsql immutable set search_path=public,pg_temp as $$
declare a jsonb; b jsonb; i integer; j integer; ma text; mb text;
begin
  if jsonb_typeof(p_legs) is distinct from 'array' then return 'invalid_selection'; end if;
  for i in 0..jsonb_array_length(p_legs)-1 loop
    a:=p_legs->i;
    for j in i+1..jsonb_array_length(p_legs)-1 loop
      b:=p_legs->j;
      if (a->>'gameId')::uuid is distinct from (b->>'gameId')::uuid then continue; end if;
      ma:=lower(a->>'betType'); mb:=lower(b->>'betType');
      if ma=mb and lower(trim(a->>'pick'))=lower(trim(b->>'pick'))
         and (a->>'line')::numeric is not distinct from (b->>'line')::numeric then return 'duplicate_selection'; end if;
      if ma=mb then
        if ma='total' then
          if lower(a->>'pick')<>lower(b->>'pick') then return 'conflicting_totals'; end if;
          return 'repeated_total';
        elsif ma='spread' then return 'repeated_spread';
        else return 'repeated_moneyline'; end if;
      end if;
      if ma<>'total' and mb<>'total' then return 'conflicting_side_markets'; end if;
    end loop;
  end loop;
  return null;
end $$;
revoke all on function public.parlay_compatibility_error(jsonb) from public,anon,authenticated;

create or replace function public.create_parlay_wager(
  p_user_id uuid,p_user_name text,p_stake numeric,p_idempotency_key uuid,
  p_combined_american_odds bigint,p_combined_decimal_odds numeric,
  p_potential_return numeric,p_potential_profit numeric,p_legs jsonb
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare
  prior public.parlay_wagers%rowtype; wager_id uuid; item jsonb; checked jsonb;
  payload jsonb; checked_legs jsonb:='[]'; price numeric:=1; leg_price numeric;
  american bigint; name text; compatibility_problem text;
begin
  if p_user_id is null or p_idempotency_key is null or p_stake is distinct from 1
     or jsonb_typeof(p_legs) is distinct from 'array' then raise exception 'invalid_selection'; end if;
  if jsonb_array_length(p_legs)<2 or jsonb_array_length(p_legs)>20 then raise exception 'invalid_selection'; end if;
  select jsonb_agg(value order by value::text) into payload from jsonb_array_elements(p_legs);
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text||p_idempotency_key::text,0));
  select * into prior from public.parlay_wagers where user_id=p_user_id and idempotency_key=p_idempotency_key;
  if found then
    if prior.request_payload is distinct from payload then raise exception 'idempotency_conflict'; end if;
    return prior.id;
  end if;
  -- Stable game-lock order prevents opposing multi-game submissions deadlocking.
  perform id from public.games where id in (select (value->>'gameId')::uuid from jsonb_array_elements(p_legs)) order by id for share;
  compatibility_problem:=public.parlay_compatibility_error(p_legs);
  if compatibility_problem is not null then raise exception '%',compatibility_problem; end if;
  for item in select value from jsonb_array_elements(p_legs) loop
    checked:=public.checked_wager_selection(item);
    checked_legs:=checked_legs||jsonb_build_array(checked);
    leg_price:=case when (checked->>'odds')::numeric>0 then 1+(checked->>'odds')::numeric/100 else 1+100/abs((checked->>'odds')::numeric) end;
    price:=price*leg_price;
  end loop;
  if jsonb_array_length(p_legs)<>(select count(distinct (value->>'gameId')::uuid) from jsonb_array_elements(checked_legs)) then raise exception 'sgp_pricing_unavailable'; end if;
  if price>999999999999 then raise exception 'invalid_selection'; end if;
  american:=case when price>=2 then round((price-1)*100)::bigint else round(-100/(price-1))::bigint end;
  select coalesce(nullif(trim(display_name),''),'Player') into name from public.profiles where id=p_user_id;
  insert into public.parlay_wagers(user_id,user_name,idempotency_key,request_payload,pricing_method,accepted_group_prices,
    same_game_price_estimate,stake,combined_american_odds,combined_decimal_odds,potential_return,potential_profit)
  values(p_user_id,coalesce(name,'Player'),p_idempotency_key,payload,'independent_games',checked_legs,
    false,1,american,price,round(price,2),round(price-1,2)) returning id into wager_id;
  for item in select value from jsonb_array_elements(checked_legs) loop
    leg_price:=case when (item->>'odds')::numeric>0 then 1+(item->>'odds')::numeric/100 else 1+100/abs((item->>'odds')::numeric) end;
    insert into public.parlay_legs(parlay_id,game_id,sport,market,selection,line,american_odds,decimal_odds)
    values(wager_id,(item->>'gameId')::uuid,item->>'sport',item->>'betType',item->>'pick',(item->>'line')::numeric,(item->>'odds')::integer,leg_price);
  end loop;
  return wager_id;
end $$;
revoke all on function public.create_parlay_wager(uuid,text,numeric,uuid,bigint,numeric,numeric,numeric,jsonb) from public,anon,authenticated;
grant execute on function public.create_parlay_wager(uuid,text,numeric,uuid,bigint,numeric,numeric,numeric,jsonb) to service_role;

notify pgrst,'reload schema';
commit;
