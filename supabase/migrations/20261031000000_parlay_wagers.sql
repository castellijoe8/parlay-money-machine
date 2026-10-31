-- Additive parlay persistence. Existing single-pick rows and grading remain unchanged.
create table if not exists public.parlay_wagers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  idempotency_key uuid not null,
  share_token uuid unique,
  same_game_price_estimate boolean not null default false,
  user_name text not null default 'Player',
  stake numeric(12,2) not null default 1 check (stake = 1),
  combined_american_odds bigint not null,
  combined_decimal_odds numeric(24,10) not null check (combined_decimal_odds > 1),
  potential_return numeric(14,2) not null,
  potential_profit numeric(14,2) not null,
  actual_return numeric(14,2),
  status text not null default 'pending' check (status in ('pending','won','lost','push','void')),
  created_at timestamptz not null default now(),
  settled_at timestamptz,
  unique (user_id, idempotency_key)
);

create table if not exists public.parlay_legs (
  id uuid primary key default gen_random_uuid(),
  parlay_id uuid not null references public.parlay_wagers(id) on delete cascade,
  game_id uuid not null references public.games(id),
  sport text not null check (sport in ('nfl','ncaaf')),
  market text not null check (market in ('Spread','Total','Moneyline')),
  selection text not null,
  line numeric,
  american_odds integer not null check (american_odds <> 0),
  decimal_odds numeric(18,10) not null check (decimal_odds > 1),
  result text not null default 'pending' check (result in ('pending','won','lost','push','void')),
  settled_at timestamptz
);

create index if not exists parlay_wagers_user_created_idx on public.parlay_wagers(user_id, created_at desc);
create index if not exists parlay_legs_game_result_idx on public.parlay_legs(game_id, result);
create unique index if not exists parlay_legs_unique_selection_idx
  on public.parlay_legs(parlay_id, game_id, market, selection, (coalesce(line, 0)));

alter table public.parlay_wagers enable row level security;
alter table public.parlay_legs enable row level security;
grant select on public.parlay_wagers, public.parlay_legs to authenticated;
drop policy if exists "Users can read their own parlay wagers" on public.parlay_wagers;
create policy "Users can read their own parlay wagers" on public.parlay_wagers for select to authenticated using (auth.uid() = user_id);
drop policy if exists "Users can read legs for their own parlays" on public.parlay_legs;
create policy "Users can read legs for their own parlays" on public.parlay_legs for select to authenticated using (exists (select 1 from public.parlay_wagers w where w.id = parlay_id and w.user_id = auth.uid()));

create or replace function public.create_parlay_wager(
  p_user_id uuid,
  p_user_name text,
  p_stake numeric,
  p_idempotency_key uuid,
  p_combined_american_odds bigint,
  p_combined_decimal_odds numeric,
  p_potential_return numeric,
  p_potential_profit numeric,
  p_legs jsonb
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  wager_id uuid;
  item jsonb;
  game_row public.games%rowtype;
  expected_price integer;
  expected_line numeric;
  leg_decimal numeric;
  combined_decimal numeric := 1;
  expected_american integer;
  leg_count integer := 0;
begin
  select id into wager_id from public.parlay_wagers where user_id=p_user_id and idempotency_key=p_idempotency_key;
  if found then return wager_id; end if;
  if p_stake <> 1 or jsonb_typeof(p_legs) <> 'array' or jsonb_array_length(p_legs) < 2 or jsonb_array_length(p_legs) > 20 then
    raise exception 'invalid_parlay';
  end if;
  for item in select value from jsonb_array_elements(p_legs) loop
    leg_count := leg_count + 1;
    select * into game_row from public.games where id = (item->>'gameId')::uuid for update;
    if not found or game_row.sport not in ('nfl','ncaaf') then raise exception 'invalid_game'; end if;
    if game_row.status <> 'scheduled' or game_row.starts_at <= now() then raise exception 'wagering_closed'; end if;
    if item->>'betType' = 'Spread' then
      if item->>'pick' = game_row.home_team then expected_price := game_row.spread_odds_home; expected_line := game_row.spread_home;
      elsif item->>'pick' = game_row.away_team then expected_price := game_row.spread_odds_away; expected_line := game_row.spread;
      else raise exception 'invalid_selection'; end if;
    elsif item->>'betType' = 'Moneyline' then
      if item->>'pick' = game_row.home_team then expected_price := game_row.moneyline_home;
      elsif item->>'pick' = game_row.away_team then expected_price := game_row.moneyline_away;
      else raise exception 'invalid_selection'; end if;
      expected_line := null;
    elsif item->>'betType' = 'Total' then
      if item->>'pick' = 'Over' then expected_price := game_row.total_odds_over;
      elsif item->>'pick' = 'Under' then expected_price := game_row.total_odds_under;
      else raise exception 'invalid_selection'; end if;
      expected_line := game_row.total;
    else raise exception 'invalid_market'; end if;
    if expected_price is null or expected_price = 0 or expected_price <> (item->>'odds')::integer then raise exception 'price_changed'; end if;
    if item->>'betType' <> 'Moneyline' and expected_line is distinct from (item->>'line')::numeric then raise exception 'price_changed'; end if;
    leg_decimal := case when expected_price > 0 then 1 + expected_price::numeric / 100 else 1 + 100::numeric / abs(expected_price) end;
    combined_decimal := combined_decimal * leg_decimal;
  end loop;
  if leg_count <> (select count(*) from (select distinct value->>'gameId', value->>'betType', value->>'pick', coalesce(value->>'line','ml') from jsonb_array_elements(p_legs)) unique_selections) then raise exception 'duplicate_selection'; end if;
  if abs(combined_decimal - p_combined_decimal_odds) > 0.00000001 then raise exception 'price_changed'; end if;
  expected_american := case when combined_decimal >= 2 then round((combined_decimal - 1) * 100)::integer else round(-100 / (combined_decimal - 1))::integer end;
  if expected_american <> p_combined_american_odds then raise exception 'price_changed'; end if;

  insert into public.parlay_wagers(user_id,user_name,idempotency_key,same_game_price_estimate,stake,combined_american_odds,combined_decimal_odds,potential_return,potential_profit)
  values (p_user_id,coalesce(nullif(trim(p_user_name),''),'Player'),p_idempotency_key,
    leg_count > (select count(distinct value->>'gameId') from jsonb_array_elements(p_legs)),
    p_stake,p_combined_american_odds,combined_decimal,round(p_stake*combined_decimal,2),round(p_stake*(combined_decimal-1),2)) on conflict (user_id,idempotency_key) do nothing returning id into wager_id;
  if wager_id is null then select id into wager_id from public.parlay_wagers where user_id=p_user_id and idempotency_key=p_idempotency_key; return wager_id; end if;
  for item in select value from jsonb_array_elements(p_legs) loop
    expected_price := (item->>'odds')::integer;
    leg_decimal := case when expected_price > 0 then 1 + expected_price::numeric / 100 else 1 + 100::numeric / abs(expected_price) end;
    insert into public.parlay_legs(parlay_id,game_id,sport,market,selection,line,american_odds,decimal_odds)
    values (wager_id,(item->>'gameId')::uuid,item->>'sport',item->>'betType',item->>'pick',nullif(item->>'line','')::numeric,expected_price,leg_decimal);
  end loop;
  return wager_id;
end;
$$;

revoke all on function public.create_parlay_wager(uuid,text,numeric,uuid,bigint,numeric,numeric,numeric,jsonb) from public, anon, authenticated;
grant execute on function public.create_parlay_wager(uuid,text,numeric,uuid,bigint,numeric,numeric,numeric,jsonb) to service_role;

create or replace function public.settle_parlay_legs(game_id_input uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare game_row public.games%rowtype; leg_row record; leg_result text; wager_row record; effective_decimal numeric; any_winning_leg boolean; any_pushed_leg boolean;
begin
  select * into game_row from public.games where id = game_id_input;
  if not found or game_row.status <> 'final' or game_row.home_score is null or game_row.away_score is null then return; end if;
  for leg_row in select l.* from public.parlay_legs l where l.game_id = game_id_input and l.result = 'pending' loop
    if leg_row.market = 'Moneyline' then
      leg_result := case when (leg_row.selection = game_row.home_team and game_row.home_score > game_row.away_score) or (leg_row.selection = game_row.away_team and game_row.away_score > game_row.home_score) then 'won' when game_row.home_score = game_row.away_score then 'push' else 'lost' end;
    elsif leg_row.market = 'Spread' then
      if leg_row.selection = game_row.home_team then leg_result := case when game_row.home_score + leg_row.line > game_row.away_score then 'won' when game_row.home_score + leg_row.line = game_row.away_score then 'push' else 'lost' end;
      else leg_result := case when game_row.away_score + leg_row.line > game_row.home_score then 'won' when game_row.away_score + leg_row.line = game_row.home_score then 'push' else 'lost' end; end if;
    else
      if game_row.home_score + game_row.away_score = leg_row.line then leg_result := 'push';
      elsif (leg_row.selection = 'Over' and game_row.home_score + game_row.away_score > leg_row.line) or (leg_row.selection = 'Under' and game_row.home_score + game_row.away_score < leg_row.line) then leg_result := 'won';
      else leg_result := 'lost'; end if;
    end if;
    update public.parlay_legs set result = leg_result, settled_at = now() where id = leg_row.id and result = 'pending';
  end loop;

  for wager_row in select distinct w.id,w.stake from public.parlay_wagers w join public.parlay_legs l on l.parlay_id = w.id where l.game_id = game_id_input and w.status = 'pending' loop
    if exists (select 1 from public.parlay_legs where parlay_id = wager_row.id and result = 'lost') then
      update public.parlay_wagers set status='lost', actual_return=0, settled_at=now() where id=wager_row.id and status='pending';
    elsif not exists (select 1 from public.parlay_legs where parlay_id=wager_row.id and result='pending') then
      select coalesce(exp(sum(ln(decimal_odds)) filter (where result='won')),1), bool_or(result='won'), bool_or(result='push') into effective_decimal,any_winning_leg,any_pushed_leg from public.parlay_legs where parlay_id=wager_row.id;
      update public.parlay_wagers set status=case when any_winning_leg then 'won' when any_pushed_leg then 'push' else 'void' end,
        actual_return=case when any_winning_leg then round(wager_row.stake*effective_decimal,2) else wager_row.stake end, settled_at=now() where id=wager_row.id and status='pending';
    end if;
  end loop;
end;
$$;
revoke all on function public.settle_parlay_legs(uuid) from public, anon, authenticated;
grant execute on function public.settle_parlay_legs(uuid) to service_role;
