"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getPacificWeekWindow } from "@/lib/daily-edge-window";
import { resultCode } from "@/lib/rivalries";
import { wagerMatchup } from "@/lib/wager-matchup";

type Game = {
  id: string; away_team: string; home_team: string; starts_at: string;
  status: string; away_score: number | null; home_score: number | null;
};
type Pick = {
  id: string; user_id: string; user_name: string | null; game_id: string;
  pick: string; bet_type: string | null; line: number | null; odds: number | null;
  result: string | null; game: Game | null;
};
type Leg = {
  id: string; selection: string; market: string; line: number | null;
  odds: number; result: string; game: { away_team: string; home_team: string } | null;
};
type Parlay = { id: string; user_name: string; status: string; legs: Leg[] };
type Lock = { user_id: string; pick_id: string };
type Activity = {
  id: string; user_name: string | null; result: string | null; units: number | null;
  kind: string; created_at: string;
};

function odds(value: number | null) {
  return value === null ? "—" : value > 0 ? `+${value}` : String(value);
}
function selection(pick: Pick) {
  return `${pick.pick} ${pick.bet_type?.toLowerCase() === "moneyline" ? "ML" : pick.line === null ? "" : pick.line > 0 && pick.bet_type?.toLowerCase() === "spread" ? `+${pick.line}` : pick.line} (${odds(pick.odds)})`;
}

export default function ClubhousePage() {
  const [picks, setPicks] = useState<Pick[]>([]);
  const [parlays, setParlays] = useState<Parlay[]>([]);
  const [locks, setLocks] = useState<Lock[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [signedIn, setSignedIn] = useState(false);
  const [updated, setUpdated] = useState<Date | null>(null);

  useEffect(() => {
    let active = true;
    let running = false;
    async function refresh() {
      if (running) return;
      running = true;
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!active) return;
        setSignedIn(Boolean(user));
        if (!user) return;
        const week = getPacificWeekWindow(new Date(), 2);
        const weekDate = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(week.start);
        const [pickData, parlayData, lockData, activityData] = await Promise.all([
          supabase.from("picks").select("id,user_id,user_name,game_id,pick,bet_type,line,odds,result,game:games!inner(id,away_team,home_team,starts_at,status,away_score,home_score)").gte("game.starts_at", week.startIso).order("created_at", { ascending: false }),
          supabase.rpc("friends_parlays"),
          supabase.from("weekly_locks").select("user_id,pick_id").eq("week_start", weekDate),
          supabase.from("wager_records").select("id,user_name,result,units,kind,created_at").gte("created_at", week.startIso).order("created_at", { ascending: false }),
        ]);
        if (!active) return;
        if (pickData.error || parlayData.error || lockData.error || activityData.error) throw new Error("Could not refresh the Clubhouse. Please try again shortly.");
        // Locks may have been placed before the current week began.
        const missingIds = (lockData.data ?? []).filter((lock) => !(pickData.data ?? []).some((pick) => pick.id === lock.pick_id)).map((lock) => lock.pick_id);
        let lockPicks: unknown[] = [];
        if (missingIds.length) {
          const extra = await supabase.from("picks").select("id,user_id,user_name,game_id,pick,bet_type,line,odds,result,game:games(id,away_team,home_team,starts_at,status,away_score,home_score)").in("id", missingIds);
          if (extra.error) throw new Error("Could not load this week’s locks.");
          lockPicks = extra.data ?? [];
        }
        if (!active) return;
        setPicks([...(pickData.data ?? []), ...lockPicks] as unknown as Pick[]);
        setParlays(parlayData.data ?? []);
        setLocks(lockData.data ?? []);
        setActivity(activityData.data ?? []);
        setUpdated(new Date());
        setError("");
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : "Could not load Clubhouse.");
      } finally {
        running = false;
        if (active) setLoading(false);
      }
    }
    void refresh();
    const timer = setInterval(() => void refresh(), 60000);
    return () => { active = false; clearInterval(timer); };
  }, []);

  const livePicks = picks.filter((pick) => pick.game?.status === "live" && resultCode(pick.result) === "pending");
  const aliveParlays = parlays.filter((parlay) => parlay.status === "pending" && parlay.legs?.length && !parlay.legs.some((leg) => resultCode(leg.result) === "loss"))
    .sort((a, b) => a.legs.filter((leg) => resultCode(leg.result) === "pending").length - b.legs.filter((leg) => resultCode(leg.result) === "pending").length).slice(0, 8);
  const rivalries: { key: string; first: Pick; second: Pick }[] = [];
  const seen = new Set<string>();
  for (const first of picks) {
    if (!first.game || !["scheduled", "live"].includes(first.game.status)) continue;
    const second = picks.find((other) => other.user_id !== first.user_id && other.game_id === first.game_id
      && other.bet_type?.toLowerCase() === first.bet_type?.toLowerCase() && other.pick !== first.pick
      && ["spread", "total", "moneyline"].includes(first.bet_type?.toLowerCase() ?? ""));
    if (!second) continue;
    const key = [first.id, second.id].sort().join(":");
    if (!seen.has(key)) { seen.add(key); rivalries.push({ key, first, second }); }
  }
  const settled = activity.filter((bet) => ["win", "loss", "push", "void"].includes(resultCode(bet.result))).slice(0, 8);
  const card = "rounded-2xl border border-gray-200 bg-white p-4 shadow-sm";
  return <main className="mx-auto max-w-5xl space-y-6 px-4 py-6 pb-28">
    <header className="rounded-2xl bg-[#18453B] p-6 text-white">
      <p className="text-xs font-bold uppercase tracking-widest text-green-200">Your crew. Your games.</p>
      <h1 className="mt-2 text-3xl font-black">The Clubhouse</h1>
      <p className="mt-2 text-sm">Follow the sweats, the rivalries, and the picks everyone has to defend.</p>
      {updated && <p className="mt-3 text-xs text-green-200">Updated {updated.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} · Refreshes every minute</p>}
    </header>
    {error && <p role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4">{error}</p>}
    {loading ? <p role="status">Loading the crew…</p> : !signedIn ? <p className={card}><Link href="/login" className="font-bold text-green-800 underline">Sign in</Link> to join the Clubhouse.</p> : <>
      <section aria-labelledby="sweats"><h2 id="sweats" className="mb-3 text-xl font-black">The Sweat Room</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {livePicks.map((pick) => <article className={card} key={pick.id}>
            <p className="text-xs font-bold uppercase text-red-700">Live · {pick.user_name || "Player"}</p>
            <h3 className="mt-1 break-words font-semibold">{wagerMatchup(pick.game)}</h3>
            <p className="font-bold">{selection(pick)}</p>
            <p className="mt-2 text-sm">Score · {pick.game?.away_score ?? "—"}–{pick.game?.home_score ?? "—"}</p>
            <Link href={`/wager/${pick.game_id}`} className="text-sm font-semibold text-green-800 underline">Follow game</Link>
          </article>)}
          {aliveParlays.map((parlay) => {
            const remaining = parlay.legs.filter((leg) => resultCode(leg.result) === "pending");
            return <article key={parlay.id} className={card}>
              <p className="text-xs font-bold uppercase text-green-800">{remaining.length === 1 ? "One leg away" : "Still in play"}</p>
              <h3 className="mt-1 font-bold">{parlay.user_name} · {parlay.legs.length}-leg parlay</h3>
              <p className="text-sm">{parlay.legs.filter((leg) => resultCode(leg.result) === "win").length} won · {remaining.length} unresolved</p>
              <ul className="mt-2 space-y-2">{remaining.map((leg) => <li key={leg.id} className="break-words border-t pt-2 text-sm">
                <p className="font-medium">{wagerMatchup(leg.game)}</p>
                <strong>{leg.selection} {leg.market === "Moneyline" ? "ML" : leg.line ?? "—"}</strong> ({odds(leg.odds)})
              </li>)}</ul>
              <Link href="/friends" className="mt-2 inline-block text-sm font-semibold text-green-800 underline">View crew bets</Link>
            </article>;
          })}
        </div>
        {!livePicks.length && !aliveParlays.length && <p className={card}>No active sweats right now. Check back when the games get going.</p>}
      </section>
      <section aria-labelledby="rivalries"><h2 id="rivalries" className="mb-3 text-xl font-black">Rivalry Watch</h2>
        <div className="grid gap-3 sm:grid-cols-2">{rivalries.slice(0, 8).map(({ key, first, second }) => <article key={key} className={card}>
          <h3 className="break-words font-semibold">{wagerMatchup(first.game)}</h3>
          <p className="mt-2 text-sm"><strong>{first.user_name || "Player"}</strong> · {selection(first)}</p>
          <p className="text-sm"><strong>{second.user_name || "Player"}</strong> · {selection(second)}</p>
          <Link href="/leaderboard" className="mt-2 inline-block text-sm font-semibold text-green-800 underline">See rivalry records</Link>
        </article>)}</div>
        {!rivalries.length && <p className={card}>No opposing picks on upcoming or live games this week yet.</p>}
      </section>
      <section aria-labelledby="locks"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 id="locks" className="text-xl font-black">The Lock Board</h2><Link href="/leaderboard" className="text-sm font-bold text-green-800 underline">Choose your lock</Link></div>
        <div className="grid gap-3 sm:grid-cols-2">{locks.map((lock) => {
          const pick = picks.find((item) => item.id === lock.pick_id);
          return <article className={card} key={lock.user_id}><h3 className="font-bold">{pick?.user_name || "Player"} · Lock of the Week</h3>
            {pick ? <><p className="mt-1 break-words font-medium">{wagerMatchup(pick.game)}</p><p>{selection(pick)}</p><p className="mt-2 text-xs font-bold uppercase">{resultCode(pick.result)}</p></> : <p>Selection unavailable</p>}
          </article>;
        })}</div>
        {!locks.length && <p className={card}>Nobody has planted their flag this week. Make your lock on the Leaderboard.</p>}
      </section>
      <section aria-labelledby="headlines"><h2 id="headlines" className="mb-3 text-xl font-black">Crew Headlines</h2>
        <p className="mb-3 text-sm text-gray-600">Latest results from wagers placed in this Tuesday–Monday week.</p>
        <ul className="space-y-2">{settled.map((bet) => <li key={bet.id} className={card}><strong>{bet.user_name || "Player"}</strong> · {resultCode(bet.result)} · {bet.kind === "parlay" ? "Parlay" : "Single"} · {Number(bet.units ?? 0) >= 0 ? "+" : ""}{Number(bet.units ?? 0).toFixed(2)} units</li>)}</ul>
        {!settled.length && <p className={card}>The week’s story is still being written. Results appear as bets settle.</p>}
      </section>
    </>}
  </main>;
}
