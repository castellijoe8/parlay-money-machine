-- Isolated test fixture matching the audited core schema, never a production migration.
create role anon;
create role authenticated;
create role service_role bypassrls;
create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema auth to authenticated,anon,service_role;
grant execute on function auth.uid() to authenticated,anon,service_role;
create table public.profiles(id uuid primary key references auth.users(id),display_name text unique);
create table public.games(
 id uuid primary key default gen_random_uuid(),external_id text,sport text,
 starts_at timestamptz,away_team text,home_team text,away_score integer,home_score integer,
 status text,spread numeric,total numeric,moneyline_away integer,moneyline_home integer,
 created_at timestamptz default now(),updated_at timestamptz default now(),spread_home numeric,
 spread_odds_away numeric,spread_odds_home numeric,total_odds_over numeric,total_odds_under numeric
);
create table public.picks(
 id uuid primary key default gen_random_uuid(),game_id uuid references public.games(id),user_name text,
 pick text,created_at timestamptz default now(),user_id uuid references auth.users(id),
 bet_type text,line numeric,odds integer,result text,units numeric,
 constraint picks_user_game_key unique(user_id,game_id)
);
alter table public.profiles enable row level security;
alter table public.games enable row level security;
alter table public.picks enable row level security;
create policy profiles_read on public.profiles for select to authenticated using(true);
create policy games_read on public.games for select to authenticated,anon using(true);
create policy picks_read on public.picks for select to authenticated using(true);
grant select on public.profiles,public.games,public.picks to authenticated;
grant select on public.games to anon;
grant select,insert,update on public.games to service_role;
-- Existing single settlement is outside the migration's scope. Fail explicitly
-- if a test accidentally invokes this fixture instead of testing parlay grading.
create function public.score_game(uuid) returns void language plpgsql as $$begin raise exception 'Single scoring is not exercised by this fixture'; end$$;
insert into auth.users values('10000000-0000-4000-8000-000000000001'),('10000000-0000-4000-8000-000000000002');
insert into public.profiles values('10000000-0000-4000-8000-000000000001','PlayerOne'),('10000000-0000-4000-8000-000000000002','PlayerTwo');
