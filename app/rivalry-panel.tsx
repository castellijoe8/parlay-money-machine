"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getPacificWeekWindow, isWithinWeeklyWindow } from "@/lib/daily-edge-window";
import { resultCode, rivalryRecord, type RivalPick } from "@/lib/rivalries";
import { wagerMatchup } from "@/lib/wager-matchup";

type Lock = { user_id: string; week_start: string; pick_id: string };
type RecapWager = { user_id: string; units: number | null; result: string | null; created_at: string; kind: string };
type Player = { id: string; display_name: string | null };

export default function RivalryPanel() {
  const [recapWagers, setRecapWagers] = useState<RecapWager[]>([]);
  const [picks, setPicks] = useState<RivalPick[]>([]);
  const [locks, setLocks] = useState<Lock[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [userId, setUserId] = useState("");
  const [previousWeek, setPreviousWeek] = useState(false);
  const [opponent, setOpponent] = useState("");
  const [selection, setSelection] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => new Date());
  const week = getPacificWeekWindow(now, 2);
  const recapWeek = previousWeek ? getPacificWeekWindow(new Date(week.start.getTime() - 1), 2) : week;
  const weekDate = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(week.start);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    let active = true;
    async function load() {
      const auth = await supabase.auth.getUser();
      if (!active) return;
      setUserId(auth.data.user?.id ?? "");
      const [pickData, lockData, profileData, wagerData] = await Promise.all([
        supabase.from("picks").select("id,user_id,game_id,pick,bet_type,line,result,units,game:games(starts_at,away_team,home_team)"),
        supabase.from("weekly_locks").select("user_id,week_start,pick_id"),
        supabase.from("profiles").select("id,display_name"),
        supabase.from("wager_records").select("user_id,units,result,created_at,kind"),
      ]);
      if (!active) return;
      if (pickData.error || lockData.error || profileData.error || wagerData.error) {
        setMessage("Unable to load locks and rivalries. Check the weekly locks database migration.");
      } else {
        setRecapWagers(wagerData.data ?? []);
        setPicks((pickData.data ?? []) as unknown as RivalPick[]);
        setLocks(lockData.data ?? []);
        setPlayers(profileData.data ?? []);
      }
      setLoading(false);
    }
    void load();
    return () => { active = false; clearInterval(timer); };
  }, []);

  const name = (id: string) => players.find((player) => player.id === id)?.display_name || "Player";
  const weekPicks = picks.filter((pick) => pick.game && isWithinWeeklyWindow(pick.game.starts_at, week));
  const currentLock = locks.find((lock) => lock.user_id === userId && lock.week_start === weekDate);
  const eligible = weekPicks.filter((pick) => pick.user_id === userId && pick.game
    && Date.parse(pick.game.starts_at) > now.getTime() && resultCode(pick.result) === "pending");
  const currentPick = picks.find((pick) => pick.id === currentLock?.pick_id);

  async function saveLock() {
    setBusy(true);
    setMessage("");
    const { error } = await supabase.rpc("choose_weekly_lock", { p_pick_id: selection });
    if (error) setMessage(error.message);
    else {
      const { data, error: loadError } = await supabase.from("weekly_locks").select("user_id,week_start,pick_id");
      if (loadError) setMessage("Lock saved. Refresh to see the updated record.");
      else { setLocks(data ?? []); setMessage("Your lock is saved."); }
    }
    setBusy(false);
  }

  const record = (rows: RivalPick[]) => {
    const count = (result: string) => rows.filter((pick) => resultCode(pick.result) === result).length;
    return `${count("win")}–${count("loss")}–${count("push")} W–L–P`;
  };
  const describe = (pick: RivalPick) => `${wagerMatchup(pick.game)} · ${pick.pick} ${pick.line ?? ""}`;

  return <section className="mt-8 space-y-5" aria-label="Locks and rivalries">
    <div className="rounded-2xl border bg-white p-5">
      <h2 className="text-xl font-bold">Lock of the Week</h2>
      <p className="mt-1 text-sm text-gray-600">{week.label} · Tuesday–Monday · Pacific time</p>
      <p className="mt-1 text-sm">Choose one of your single wagers before kickoff. You can change it until your selected game starts.</p>
      {loading ? <p>Loading locks…</p> : <>
        {currentPick && <p className="mt-3 font-semibold">Your lock · {describe(currentPick)} · {resultCode(currentPick.result)}</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          <select aria-label="Choose your weekly lock" value={selection} onChange={(event) => setSelection(event.target.value)} className="min-w-0 max-w-full rounded border p-2">
            <option value="">Select an upcoming single wager</option>
            {eligible.map((pick) => <option key={pick.id} value={pick.id}>{describe(pick)}</option>)}
          </select>
          <button disabled={busy || !selection || !userId || Boolean(currentPick?.game && Date.parse(currentPick.game.starts_at) <= now.getTime())} onClick={() => void saveLock()} className="rounded bg-green-800 px-4 py-2 font-bold text-white disabled:opacity-50">Save lock</button>
        </div>
        {!eligible.length && <p className="mt-2 text-sm">Place a single wager on an upcoming game in this window to choose your lock.</p>}
        <ul className="mt-4 space-y-2">{players.filter((player) => locks.some((lock) => lock.user_id === player.id)).map((player) => {
          const lockedPicks = picks.filter((pick) => locks.some((lock) => lock.user_id === player.id && lock.pick_id === pick.id));
          const thisWeek = locks.find((lock) => lock.user_id === player.id && lock.week_start === weekDate);
          const pick = picks.find((item) => item.id === thisWeek?.pick_id);
          return <li key={player.id} className="border-t pt-2"><strong>{name(player.id)}</strong> · {record(lockedPicks)}
            <p className="break-words text-sm">{pick ? describe(pick) : "No lock this week"}</p></li>;
        })}</ul>
      </>}
    </div>
    <div className="rounded-2xl border bg-white p-5">
      <h2 className="text-xl font-bold">Weekly recap</h2>
      <label className="mt-2 block text-sm">Recap period <select value={previousWeek ? "previous" : "current"} onChange={(event) => setPreviousWeek(event.target.value === "previous")} className="rounded border p-2">
        <option value="current">This week</option><option value="previous">Last week</option>
      </select></label>
      <p className="text-sm text-gray-600">{recapWeek.label} · Settled results for bets placed this week. Updates as games finish.</p>
      <ol className="mt-3 space-y-2">{players.map((player) => {
        const bets = recapWagers.filter((bet) => bet.user_id === player.id && isWithinWeeklyWindow(bet.created_at, recapWeek));
        const settled = bets.filter((bet) => ["win", "loss", "push", "void"].includes(resultCode(bet.result)));
        const net = settled.reduce((sum, bet) => sum + Number(bet.units ?? 0), 0);
        const bestParlay = settled.filter((bet) => bet.kind === "parlay" && resultCode(bet.result) === "win").sort((a, b) => Number(b.units) - Number(a.units))[0];
        return { player, bets, settled, net, bestParlay };
      }).filter((row) => row.bets.length).sort((a, b) => b.net - a.net).map((row, index) => <li key={row.player.id} className="border-t pt-2">
        <strong>{index + 1}. {name(row.player.id)}</strong> · {row.net >= 0 ? "+" : ""}{row.net.toFixed(2)} units
        <p className="text-sm">{row.settled.length} settled · {row.bets.length - row.settled.length} pending{row.bestParlay ? ` · Best parlay +${Number(row.bestParlay.units).toFixed(2)} units` : ""}</p>
      </li>)}</ol>
    </div>
    <div className="rounded-2xl border bg-white p-5">
      <h2 className="text-xl font-bold">Rivalry recap</h2>
      <p className="mt-1 text-sm text-gray-600">Opposing single wagers on the same game and market. Each game and market counts once. A win requires your pick to win and theirs to lose.</p>
      <label className="mt-3 block">Your rival
        <select value={opponent} onChange={(event) => setOpponent(event.target.value)} className="ml-2 max-w-full rounded border p-2">
          <option value="">Choose a player</option>
          {players.filter((player) => player.id !== userId).map((player) => <option key={player.id} value={player.id}>{name(player.id)}</option>)}
        </select>
      </label>
      {opponent && [ { label: `Weekly · ${recapWeek.label}`, rows: picks.filter((pick) => pick.game && isWithinWeeklyWindow(pick.game.starts_at, recapWeek)) }, { label: "All time", rows: picks } ].map(({ label, rows }) => {
        const summary = rivalryRecord(rows, userId, opponent);
        return <div key={label} className="mt-3 border-t pt-3"><h3 className="font-bold">{label}</h3>
          <p>{summary.wins} wins · {summary.losses} losses · {summary.other} other outcomes · {summary.pending} pending</p>
          <p className="text-xs text-gray-600">Pushes, voids, and meetings where both picks win or lose count as other outcomes.</p>
        </div>;
      })}
    </div>
    {message && <p role="status" className="rounded border p-3 text-sm">{message}</p>}
  </section>;
}
