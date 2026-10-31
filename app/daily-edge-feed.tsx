"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { recentGameNuggets, teamForm, teamStreak, type EdgeNugget, type FinalGame } from "@/lib/daily-edge";
import { supabase } from "@/lib/supabase";

const gameFields = "id, sport, away_team, home_team, starts_at, status, home_score, away_score";
const sports = ["ncaaf", "nfl"] as const;

async function loadFinalHistory() {
  const responses = await Promise.all(sports.map((sport) =>
    supabase.from("games").select(gameFields).eq("sport", sport).eq("status", "final").not("home_score", "is", null).not("away_score", "is", null).order("starts_at", { ascending: false }).limit(1000)
  ));
  const failed = responses.some(({ error }) => error);
  return {
    failed,
    games: responses.flatMap(({ data }) => (data ?? []) as FinalGame[]).sort((a, b) => Date.parse(b.starts_at) - Date.parse(a.starts_at)),
  };
}

function useDailyEdge() {
  const [nuggets, setNuggets] = useState<EdgeNugget[]>([]);
  const [todayGames, setTodayGames] = useState<FinalGame[]>([]);
  const [history, setHistory] = useState<FinalGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();
      const [todayResult, historyResult] = await Promise.all([
        supabase.from("games").select(gameFields).in("status", ["scheduled", "live"]).gte("starts_at", start).lt("starts_at", end).order("starts_at"),
        loadFinalHistory(),
      ]);
      if (cancelled) return;
      if (todayResult.error || historyResult.failed) {
        setError(true);
      } else {
        const games = (todayResult.data ?? []) as FinalGame[];
        const finals = historyResult.games;
        setTodayGames(games);
        setHistory(finals);
        setNuggets(recentGameNuggets(games, finals));
      }
      setLoading(false);
    }
    void load();
    return () => { cancelled = true; };
  }, []);
  return { nuggets, todayGames, history, loading, error };
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function NuggetCard({ nugget }: { nugget: EdgeNugget }) {
  return (
    <article className="edge-card">
      <div className="edge-card-top"><span className="edge-category">{nugget.category}</span><span className="edge-freshness">Through {formatDate(nugget.freshness)}</span></div>
      <h3>{nugget.headline}</h3>
      <p className="edge-matchup">{nugget.away} <span>@</span> {nugget.home}</p>
      <p className="edge-stat">{nugget.detail}</p>
      <p className="edge-reason">{nugget.reason}</p>
      <Link href={`/wager/${nugget.gameId}`} className="edge-game-link">View matchup <span aria-hidden="true">→</span></Link>
    </article>
  );
}

export function DailyEdgePreview() {
  const { nuggets, loading, error } = useDailyEdge();
  return (
    <section className="edge-section edge-preview" aria-labelledby="daily-edge-heading">
      <div className="edge-heading-row">
        <div><p className="edge-eyebrow">DATA-LED GAME NOTES</p><h2 id="daily-edge-heading">The Daily Edge</h2><p>Historical trends worth a closer look. No trend guarantees an outcome.</p></div>
        <Link href="/daily-edge" className="edge-all-link">All insights <span aria-hidden="true">→</span></Link>
      </div>
      {loading ? <p className="edge-state">Loading today’s game notes…</p> : error ? <p className="edge-state">Game history is temporarily unavailable.</p> : nuggets.length ? <div className="edge-grid">{nuggets.slice(0, 3).map((nugget) => <NuggetCard key={nugget.id} nugget={nugget} />)}</div> : <p className="edge-state">No reliable historical trends for today’s available matchups yet.</p>}
    </section>
  );
}

export default function DailyEdgeFeed() {
  const { nuggets, todayGames, loading, error } = useDailyEdge();
  return (
    <main className="edge-page">
      <div className="edge-page-inner">
        <div className="edge-page-hero"><p className="edge-eyebrow">PARLAY MONEY MACHINE · DAILY INTELLIGENCE</p><h1>The Daily Edge</h1><p>Concise, score-backed context for today’s games. These are historical trends, not predictions or guarantees.</p></div>
        <div className="edge-day-label"><span>{new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</span><span>{todayGames.length} games on today’s board</span></div>
        {loading ? <p className="edge-state">Loading today’s game notes…</p> : error ? <p className="edge-state">Game history is temporarily unavailable. Please try again later.</p> : nuggets.length ? <div className="edge-grid edge-grid-full">{nuggets.map((nugget) => <NuggetCard key={nugget.id} nugget={nugget} />)}</div> : <div className="edge-empty"><span aria-hidden="true">✳</span><h2>No reliable nuggets today</h2><p>{todayGames.length ? "Available historical results do not support a standout trend for today’s matchups." : "There are no available games scheduled for today."} We’ll show fewer insights instead of filling the board with weak or invented claims.</p></div>}
        <p className="edge-disclosure">Statistics use completed game scores in the available history, grouped by sport. Records are limited to the most recent results on file; freshness reflects the latest supporting final. No odds history, injury feed, or news source is available in this app.</p>
      </div>
    </main>
  );
}

export function MatchupIntelligence({ game }: { game: Pick<FinalGame, "id" | "sport" | "away_team" | "home_team"> }) {
  const [history, setHistory] = useState<FinalGame[]>([]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const result = await loadFinalHistory();
      if (!cancelled && !result.failed) setHistory(result.games);
      if (!cancelled) setLoaded(true);
    }
    void load();
    return () => { cancelled = true; };
  }, []);
  const away = teamForm(history, game.away_team, game.sport);
  const home = teamForm(history, game.home_team, game.sport);
  const awayLastFive = teamForm(history, game.away_team, game.sport, 5);
  const homeLastFive = teamForm(history, game.home_team, game.sport, 5);
  const venueRecord = (team: string, venue: "home" | "away") => {
    const games = history.filter((past) => past.sport === game.sport && (venue === "home" ? past.home_team === team : past.away_team === team));
    const wins = games.filter((past) => (venue === "home" ? past.home_score! > past.away_score! : past.away_score! > past.home_score!)).length;
    return { wins, losses: games.length - wins, count: games.length };
  };
  const awayRoad = venueRecord(game.away_team, "away");
  const awayHome = venueRecord(game.away_team, "home");
  const homeAtHome = venueRecord(game.home_team, "home");
  const homeRoad = venueRecord(game.home_team, "away");
  const awayStreak = teamStreak(away, game.away_team);
  const homeStreak = teamStreak(home, game.home_team);
  const meetings = history.filter((past) => past.status === "final" && past.home_score !== null && past.away_score !== null && past.sport === game.sport && ((past.home_team === game.home_team && past.away_team === game.away_team) || (past.home_team === game.away_team && past.away_team === game.home_team))).slice(0, 5);
  return (
    <section className="matchup-intelligence" aria-labelledby="matchup-intelligence-heading">
      <div className="edge-heading-row"><div><p className="edge-eyebrow">SCORE-BASED HISTORY</p><h2 id="matchup-intelligence-heading">Betting intelligence</h2></div></div>
      {!loaded ? <p className="edge-state">Loading completed game history…</p> : !away.games.length && !home.games.length ? <p className="edge-state">No completed score history is available for these teams yet.</p> : <>
        <div className="form-grid">{[
          { team: game.away_team, form: away, lastFive: awayLastFive, streak: awayStreak, homeSplit: awayHome, awaySplit: awayRoad },
          { team: game.home_team, form: home, lastFive: homeLastFive, streak: homeStreak, homeSplit: homeAtHome, awaySplit: homeRoad },
        ].map(({ team, form, lastFive, streak, homeSplit, awaySplit }) => <article className="form-card" key={team}><p className="edge-category">{team}</p><h3>Last {lastFive.games.length < 5 ? `${lastFive.games.length} available` : "5"}: {lastFive.wins}–{lastFive.losses}</h3><p>Last {form.games.length < 10 ? `${form.games.length} available` : "10"}: {form.wins}–{form.losses}</p><p>{form.pointsFor.toFixed(1)} scored <span>·</span> {form.pointsAgainst.toFixed(1)} allowed per game (last {form.games.length})</p><p>Home: {homeSplit.wins}–{homeSplit.losses} ({homeSplit.count}) <span>·</span> Away: {awaySplit.wins}–{awaySplit.losses} ({awaySplit.count})</p>{streak && <p className="form-streak">Current streak: {streak.count} {streak.result === "W" ? "win" : "loss"}{streak.count === 1 ? "" : "s"}</p>}{form.latestDate && <small>Latest final: {formatDate(form.latestDate)}</small>}</article>)}</div>
        {meetings.length > 0 && <div className="h2h-history"><h3>Recent head-to-head</h3><ul>{meetings.map((past) => <li key={past.id}><span>{formatDate(past.starts_at)}</span><strong>{past.away_team} {past.away_score} — {past.home_score} {past.home_team}</strong></li>)}</ul></div>}
        <p className="edge-disclosure">Based on the most recent completed scores available for each team. History is descriptive and does not predict this game. ATS, totals, line movement, injuries, and news are not shown because those data are not available.</p>
      </>}
    </section>
  );
}
