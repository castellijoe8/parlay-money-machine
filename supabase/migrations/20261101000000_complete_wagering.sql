begin;

-- Extend existing tables without rewriting historical wagers.
alter table public.picks add column if not exists idempotency_key uuid;
alter table public.picks add column if not exists request_payload jsonb;
create unique index if not exists picks_submission_idx on public.picks(user_id,idempotency_key);
alter table public.parlay_wagers add column if not exists request_payload jsonb;
alter table public.parlay_wagers add column if not exists pricing_method text not null default 'legacy_independent_estimate';
alter table public.parlay_wagers add column if not exists accepted_group_prices jsonb not null default '[]';

-- Remove only the old one-pick-per-user/game restriction, including standalone
-- indexes. Do not remove unrelated uniqueness or delete any existing rows.
do $$
declare r record;
begin
  for r in
    select conname from pg_constraint c
    where conrelid='public.picks'::regclass and contype='u'
      and (select array_agg(a.attname::text order by a.attname)
           from unnest(c.conkey) k join pg_attribute a
           on a.attrelid=c.conrelid and a.attnum=k) = array['game_id','user_id']
  loop execute format('alter table public.picks drop constraint %I',r.conname); end loop;
  for r in
    select i.indexrelid::regclass as index_name from pg_index i
    where i.indrelid='public.picks'::regclass and i.indisunique and not i.indisprimary
      and i.indexprs is null and i.indnkeyatts=2
      and (select array_agg(a.attname::text order by a.attname)
           from unnest(i.indkey::smallint[]) with ordinality k(attnum,pos)
           join pg_attribute a on a.attrelid=i.indrelid and a.attnum=k.attnum
           where k.pos<=i.indnkeyatts) = array['game_id','user_id']
      and not exists(select 1 from pg_constraint c where c.conindid=i.indexrelid)
  loop execute format('drop index %s',r.index_name); end loop;
end $$;

-- Permanent cancellation is explicit, audited, and never inferred from a game
-- disappearing from the feed. Ordinary postponements remain pending.
create table if not exists public.game_voids (
  game_id uuid primary key references public.games(id),
  reason text not null check (length(trim(reason))>=10),
  voided_at timestamptz not null default now()
);
alter table public.game_voids enable row level security;
revoke all on public.game_voids from anon, authenticated;
grant select,insert on public.game_voids to service_role;
grant select on public.profiles,public.picks to service_role;
grant select,insert,update on public.parlay_wagers,public.parlay_legs to service_role;

-- Shared authoritative validator used by singles, parlay RPC and direct inserts.
create or replace function public.checked_wager_selection(p_selection jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare g public.games%rowtype; price numeric; ln numeric; market text; chosen text;
begin
  select * into g from public.games where id=(p_selection->>'gameId')::uuid for share;
  if not found then raise exception 'invalid_selection'; end if;
  if g.sport not in ('nfl','ncaaf') or (p_selection->>'sport') is distinct from g.sport then raise exception 'invalid_sport'; end if;
  if g.status is distinct from 'scheduled' or g.starts_at is null or g.starts_at<=clock_timestamp()
     or exists(select 1 from public.game_voids where game_id=g.id) then raise exception 'wagering_closed'; end if;
  market:=p_selection->>'betType'; chosen:=p_selection->>'pick';
  if market='Spread' then
    if chosen=g.home_team then price:=g.spread_odds_home; ln:=g.spread_home;
    elsif chosen=g.away_team then price:=g.spread_odds_away; ln:=g.spread;
    else raise exception 'invalid_selection'; end if;
  elsif market='Moneyline' then
    if chosen=g.home_team then price:=g.moneyline_home;
    elsif chosen=g.away_team then price:=g.moneyline_away;
    else raise exception 'invalid_selection'; end if;
    ln:=null;
  elsif market='Total' then
    if chosen='Over' then price:=g.total_odds_over;
    elsif chosen='Under' then price:=g.total_odds_under;
    else raise exception 'invalid_selection'; end if;
    ln:=g.total;
  else raise exception 'invalid_selection'; end if;
  if price is null or price=0 or price<>trunc(price)
     or (market<>'Moneyline' and ln is null)
     or (p_selection->>'odds')::numeric is distinct from price
     or (p_selection->>'line')::numeric is distinct from ln then raise exception 'price_changed'; end if;
  return jsonb_build_object('gameId',g.id,'sport',g.sport,'pick',chosen,'betType',market,'line',ln,'odds',price);
end $$;
revoke all on function public.checked_wager_selection(jsonb) from public,anon,authenticated;

create or replace function public.validate_pick()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare s jsonb; game_sport text;
begin
  select sport into game_sport from public.games where id=new.game_id;
  s:=public.checked_wager_selection(jsonb_build_object('gameId',new.game_id,'sport',game_sport,
    'betType',case lower(new.bet_type) when 'spread' then 'Spread' when 'total' then 'Total' when 'moneyline' then 'Moneyline' end,
    'pick',new.pick,'line',new.line,'odds',new.odds));
  if new.result is distinct from 'pending' or new.units is distinct from 1 then raise exception 'invalid_selection'; end if;
  new.bet_type:=lower(s->>'betType');
  select coalesce(nullif(trim(display_name),''),'Player') into new.user_name from public.profiles where id=new.user_id;
  new.user_name:=coalesce(new.user_name,'Player');
  return new;
end $$;
revoke all on function public.validate_pick() from public,anon,authenticated;
drop trigger if exists validate_pick_trigger on public.picks;
create trigger validate_pick_trigger before insert on public.picks for each row execute function public.validate_pick();

create or replace function public.create_single_wager(p_user_id uuid,p_idempotency_key uuid,p_selection jsonb)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare prior public.picks%rowtype; s jsonb; wager_id uuid;
begin
  if p_user_id is null or p_idempotency_key is null then raise exception 'invalid_selection'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text||p_idempotency_key::text,0));
  select * into prior from public.picks where user_id=p_user_id and idempotency_key=p_idempotency_key;
  if found then
    if prior.request_payload is distinct from p_selection then raise exception 'idempotency_conflict'; end if;
    return prior.id;
  end if;
  s:=public.checked_wager_selection(p_selection);
  insert into public.picks(user_id,game_id,pick,bet_type,line,odds,result,units,idempotency_key,request_payload)
  values(p_user_id,(s->>'gameId')::uuid,s->>'pick',lower(s->>'betType'),(s->>'line')::numeric,
    (s->>'odds')::integer,'pending',1,p_idempotency_key,p_selection) returning id into wager_id;
  return wager_id;
end $$;
revoke all on function public.create_single_wager(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.create_single_wager(uuid,uuid,jsonb) to service_role;

-- Retain the existing RPC signature. Ignore supplied identity labels, combined
-- prices and payouts; trusted API identity and database prices are authoritative.
create or replace function public.create_parlay_wager(
  p_user_id uuid,p_user_name text,p_stake numeric,p_idempotency_key uuid,
  p_combined_american_odds bigint,p_combined_decimal_odds numeric,
  p_potential_return numeric,p_potential_profit numeric,p_legs jsonb
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare
  prior public.parlay_wagers%rowtype; wager_id uuid; item jsonb; checked jsonb;
  payload jsonb; checked_legs jsonb:='[]'; price numeric:=1; leg_price numeric;
  american bigint; name text;
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
  if exists(select 1 from jsonb_array_elements(p_legs) a, jsonb_array_elements(p_legs) b
    where a.value<>b.value and a.value->>'gameId'=b.value->>'gameId'
      and ((a.value->>'betType'=b.value->>'betType') or
        (a.value->>'pick'=b.value->>'pick' and a.value->>'betType' in ('Spread','Moneyline') and b.value->>'betType' in ('Spread','Moneyline'))))
    then raise exception 'incompatible_selection'; end if;
  if (select count(*) from jsonb_array_elements(p_legs))<>(select count(distinct value) from jsonb_array_elements(p_legs)) then raise exception 'duplicate_selection'; end if;
  for item in select value from jsonb_array_elements(p_legs) loop
    checked:=public.checked_wager_selection(item);
    checked_legs:=checked_legs||jsonb_build_array(checked);
    leg_price:=case when (checked->>'odds')::numeric>0 then 1+(checked->>'odds')::numeric/100 else 1+100/abs((checked->>'odds')::numeric) end;
    price:=price*leg_price;
  end loop;
  if jsonb_array_length(p_legs)<>(select count(distinct value->>'gameId') from jsonb_array_elements(p_legs)) then raise exception 'sgp_pricing_unavailable'; end if;
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

create or replace function public.settle_parlay_legs(game_id_input uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare g public.games%rowtype; leg record; parent record; outcome text; margin numeric; effective numeric; winners boolean; pushes boolean; is_void boolean;
begin
  select * into g from public.games where id=game_id_input;
  if not found then return; end if;
  is_void:=exists(select 1 from public.game_voids where game_id=g.id) or g.status in ('canceled','cancelled','permanently_postponed');
  if not is_void and (g.status is distinct from 'final' or g.home_score is null or g.away_score is null) then return; end if;
  -- Serialize all settlement calls touching the same parents before updating legs.
  perform w.id from public.parlay_wagers w where exists(select 1 from public.parlay_legs l where l.parlay_id=w.id and l.game_id=g.id) order by w.id for update;
  for leg in select * from public.parlay_legs where game_id=g.id and result='pending' loop
    if is_void then outcome:='void';
    else
      if leg.market='Total' then
        margin:=g.home_score+g.away_score-leg.line;
        if leg.selection='Under' then margin:=-margin; end if;
      else
        margin:=case when leg.selection=g.home_team then g.home_score-g.away_score else g.away_score-g.home_score end;
        if leg.market='Spread' then margin:=margin+leg.line; end if;
      end if;
      outcome:=case when margin>0 then 'won' when margin=0 then 'push' else 'lost' end;
    end if;
    update public.parlay_legs set result=outcome,settled_at=now() where id=leg.id and result='pending';
  end loop;
  for parent in select w.* from public.parlay_wagers w where status='pending' and exists(select 1 from public.parlay_legs l where l.parlay_id=w.id and l.game_id=g.id) order by w.id loop
    if exists(select 1 from public.parlay_legs where parlay_id=parent.id and result='lost') then
      update public.parlay_wagers set status='lost',actual_return=0,settled_at=now() where id=parent.id and status='pending';
    elsif not exists(select 1 from public.parlay_legs where parlay_id=parent.id and result='pending') then
      select coalesce(exp(sum(ln(decimal_odds)) filter(where result='won')),1),bool_or(result='won'),bool_or(result='push')
      into effective,winners,pushes from public.parlay_legs where parlay_id=parent.id;
      update public.parlay_wagers set status=case when winners then 'won' when pushes then 'push' else 'void' end,
        actual_return=case when winners then round(parent.stake*effective,2) else parent.stake end,settled_at=now() where id=parent.id and status='pending';
    end if;
  end loop;
end $$;
revoke all on function public.settle_parlay_legs(uuid) from public,anon,authenticated;
grant execute on function public.settle_parlay_legs(uuid) to service_role;

create or replace function public.void_game_wagers(p_game_id uuid,p_reason text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if p_reason is null or length(trim(p_reason))<10 then raise exception 'A cancellation or permanent-postponement reason is required.'; end if;
  perform id from public.games where id=p_game_id for update;
  if not found then raise exception 'Game not found'; end if;
  insert into public.game_voids(game_id,reason) values(p_game_id,trim(p_reason)) on conflict(game_id) do nothing;
  update public.picks set result='push',units=0 where game_id=p_game_id and result='pending';
  perform public.settle_parlay_legs(p_game_id);
end $$;
revoke all on function public.void_game_wagers(uuid,text) from public,anon,authenticated;
grant execute on function public.void_game_wagers(uuid,text) to service_role;

create or replace function public.settle_game_parlays_trigger()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform public.settle_parlay_legs(new.id);
  return new;
end $$;
revoke all on function public.settle_game_parlays_trigger() from public,anon,authenticated;
drop trigger if exists settle_game_parlays on public.games;
create trigger settle_game_parlays after update of status,home_score,away_score on public.games
for each row execute function public.settle_game_parlays_trigger();

-- Records are parents only. No leg rows enter any record or leaderboard.
-- Share the same visibility as the existing authenticated friends picks feed.
drop policy if exists "Authenticated users can read parlay records" on public.parlay_wagers;
create policy "Authenticated users can read parlay records" on public.parlay_wagers for select to authenticated using(true);
create or replace view public.wager_records with (security_invoker=true) as
select p.id,'single'::text as kind,p.user_id,p.user_name,p.game_id,p.pick,p.bet_type,p.line,p.odds::bigint,
  p.result,case when lower(p.result)='pending' then 0 else p.units end as units,p.created_at,
  array[g.sport]::text[] as sports,
  jsonb_build_object('id',g.id,'sport',g.sport,'away_team',g.away_team,'home_team',g.home_team,'starts_at',g.starts_at) as game
from public.picks p join public.games g on g.id=p.game_id
union all
select w.id,'parlay',w.user_id,w.user_name,null::uuid,
  (select count(*)::text||'-leg parlay' from public.parlay_legs where parlay_id=w.id),'parlay',null::numeric,w.combined_american_odds,
  case w.status when 'won' then 'win' when 'lost' then 'loss' when 'void' then 'push' else w.status end,
  case when w.status='pending' then 0 else coalesce(w.actual_return,w.stake)-w.stake end,w.created_at,
  array(select distinct sport from public.parlay_legs where parlay_id=w.id),
  null::jsonb
from public.parlay_wagers w;
-- Read access to legs is needed for sport categorization, matching parent visibility.
drop policy if exists "Authenticated users can read parlay record legs" on public.parlay_legs;
create policy "Authenticated users can read parlay record legs" on public.parlay_legs for select to authenticated using(true);
grant select on public.wager_records to authenticated,service_role;

alter table public.picks enable row level security;
revoke insert,update,delete on public.picks from anon;
revoke update,delete on public.picks from authenticated;
drop policy if exists "Allow authenticated users to insert picks" on public.picks;
create policy "Allow authenticated users to insert picks" on public.picks for insert to authenticated
with check(user_id=auth.uid() and result='pending' and units=1);
-- Keep the currently deployed single-wager client working during rollout.
-- The ownership policy and validator protect legacy inserts; the new client
-- uses the idempotent API.
grant insert on public.picks to authenticated;
revoke all on function public.score_game(uuid) from public,anon,authenticated;
grant execute on function public.score_game(uuid) to service_role;
notify pgrst,'reload schema';
commit;
