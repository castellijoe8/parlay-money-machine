create table public.weekly_locks (
  user_id uuid not null references auth.users(id),
  week_start date not null,
  pick_id uuid not null references public.picks(id),
  created_at timestamptz not null default now(),
  primary key (user_id, week_start),
  unique (pick_id)
);
alter table public.weekly_locks enable row level security;
create policy "Players can read weekly locks" on public.weekly_locks
for select to authenticated using (true);
grant select on public.weekly_locks to authenticated;

create function public.choose_weekly_lock(p_pick_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  chosen record;
  previous record;
  week_date date;
  local_today date := (now() at time zone 'America/Los_Angeles')::date;
begin
  if auth.uid() is null then raise exception 'Please sign in.'; end if;
  -- Serialize requests for this player, including first-time selections.
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 0));
  week_date := local_today - ((extract(isodow from local_today)::integer + 5) % 7);
  select p.*, g.starts_at, g.status, g.sport into chosen
  from public.picks p join public.games g on g.id = p.game_id
  where p.id = p_pick_id and p.user_id = auth.uid();
  if not found then raise exception 'Choose one of your single wagers.'; end if;
  if coalesce(chosen.sport,'') not in ('nfl','ncaaf') or chosen.starts_at is null
    or chosen.starts_at <= now() or chosen.status is distinct from 'scheduled'
    or lower(coalesce(chosen.result,'pending')) <> 'pending'
    or (chosen.starts_at at time zone 'America/Los_Angeles')::date < week_date
    or (chosen.starts_at at time zone 'America/Los_Angeles')::date >= week_date + 7
  then raise exception 'Choose an upcoming game in this Tuesday–Monday window.'; end if;
  select l.pick_id, g.starts_at, g.status into previous
  from public.weekly_locks l join public.picks p on p.id=l.pick_id
  join public.games g on g.id=p.game_id
  where l.user_id=auth.uid() and l.week_start=week_date;
  if found then
    if previous.pick_id = p_pick_id then return; end if;
    if previous.starts_at <= now() or previous.status is distinct from 'scheduled' then
      raise exception 'Your lock is final after kickoff.';
    end if;
  end if;
  insert into public.weekly_locks(user_id,week_start,pick_id)
  values(auth.uid(),week_date,p_pick_id)
  on conflict(user_id,week_start) do update
    set pick_id=excluded.pick_id, created_at=now();
end $$;
revoke all on function public.choose_weekly_lock(uuid) from public;
grant execute on function public.choose_weekly_lock(uuid) to authenticated;
