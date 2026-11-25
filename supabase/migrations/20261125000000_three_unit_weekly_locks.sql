begin;
-- Existing locks on started games retain their historical scoring.
alter table public.weekly_locks add column stake_multiplier integer not null default 1 check (stake_multiplier in (1,3));
alter table public.weekly_locks alter column stake_multiplier set default 3;
-- Upgrade only existing pending locks on games that have not begun.
update public.weekly_locks l set stake_multiplier=3
from public.picks p join public.games g on g.id=p.game_id
where l.pick_id=p.id and p.result='pending' and g.status='scheduled' and g.starts_at>clock_timestamp();

-- Preserve the production grading implementation, then calculate lock profit
-- from original odds rather than multiplying already-rounded profit.
alter function public.score_game(uuid) rename to score_game_one_unit;
revoke all on function public.score_game_one_unit(uuid) from public,anon,authenticated,service_role;
create function public.score_game(game_id_input uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform public.score_game_one_unit(game_id_input);
  update public.picks p set units=case
    when p.result='loss' then -3
    when p.result='push' then 0
    when p.result='win' then case
      when p.odds>0 then round(3*p.odds::numeric/100,2)
      when p.odds<0 then round(300::numeric/abs(p.odds::numeric),2)
      when p.odds=0 then 3 else 0 end
    else p.units end
  from public.weekly_locks l
  where l.pick_id=p.id and p.game_id=game_id_input and l.stake_multiplier=3;
end $$;
revoke all on function public.score_game(uuid) from public,anon,authenticated;
grant execute on function public.score_game(uuid) to service_role;
-- Existing chooser uses an upsert; ensure switching an old lock upgrades it.
create function public.set_weekly_lock_multiplier() returns trigger
language plpgsql set search_path='' as $$
begin
  if new.pick_id is distinct from old.pick_id then new.stake_multiplier:=3; end if;
  return new;
end $$;
create trigger weekly_lock_multiplier_on_switch before update of pick_id on public.weekly_locks
for each row execute function public.set_weekly_lock_multiplier();
notify pgrst,'reload schema';
commit;
