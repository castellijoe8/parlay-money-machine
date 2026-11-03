create function public.friends_parlays()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(to_jsonb(feed) order by feed.created_at desc), '[]'::jsonb)
  from (
    select w.id, w.user_id, w.user_name, w.status, w.created_at,
      (select jsonb_agg(jsonb_build_object(
        'id', l.id, 'market', l.market, 'selection', l.selection,
        'line', l.line, 'odds', l.american_odds, 'result', l.result,
        'game', jsonb_build_object('away_team', g.away_team, 'home_team', g.home_team)
      ) order by l.id)
      from public.parlay_legs l left join public.games g on g.id = l.game_id
      where l.parlay_id = w.id) as legs
    from public.parlay_wagers w
    where auth.uid() is not null
    order by w.created_at desc, w.id
    limit 100
  ) feed;
$$;

revoke all on function public.friends_parlays() from public;
grant execute on function public.friends_parlays() to authenticated;
