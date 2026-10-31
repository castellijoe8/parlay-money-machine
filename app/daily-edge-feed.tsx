"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { EdgeNugget } from "@/lib/daily-edge";

type WeeklyData = {
  window: { start: string; end: string; label: string; timeZone: string };
  weeklyGameCount: number;
  upcomingGameCount: number;
  collegeCoverage: string;
  insights: EdgeNugget[];
  oddsHistoryAvailable: boolean;
  earliestCapturedAt: string | null;
  health: { lastOddsSyncAt: string | null; lastScoreSyncAt: string | null; lastOddsFailureAt: string | null; lastOddsFailure: string | null; lastScoreFailureAt: string | null; lastScoreFailure: string | null; lastTrendCalculationAt: string | null; lastTrendFailureAt: string | null; lastTrendFailure: string | null; dataStale: boolean; explanationMode: string };
};

function useWeeklyEdge() {
  const [data, setData] = useState<WeeklyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    const load = () => fetch("/api/daily-edge", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Daily Edge unavailable");
        return response.json() as Promise<WeeklyData>;
      })
      .then((nextData) => { setData(nextData); setError(false); })
      .catch(() => { if (!controller.signal.aborted) setError(true); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    void load();
    const interval = window.setInterval(() => { void load(); }, 15 * 60 * 1000);
    window.addEventListener("focus", load);
    return () => { controller.abort(); window.clearInterval(interval); window.removeEventListener("focus", load); };
  }, []);
  return { data, loading, error };
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function NuggetCard({ nugget }: { nugget: EdgeNugget }) {
  return <article className="edge-card">
    <div className="edge-card-top"><span className="edge-category">{nugget.category}</span><span className="edge-freshness">Updated {formatDate(nugget.freshness)}</span></div>
    <h3>{nugget.headline}</h3>
    <p className="edge-matchup">{nugget.away} <span>@</span> {nugget.home}</p>
    <p className="edge-stat">{nugget.detail}</p>
    <p className="edge-reason">{nugget.reason}</p>
    {nugget.source && <small className="edge-source">Source: {nugget.source}</small>}
    <Link href={`/wager/${nugget.gameId}`} className="edge-game-link">View matchup <span aria-hidden="true">→</span></Link>
  </article>;
}

export function DailyEdgePreview() {
  const { data, loading, error } = useWeeklyEdge();
  return <section className="edge-section edge-preview" aria-labelledby="daily-edge-heading">
    <div className="edge-heading-row"><div><p className="edge-eyebrow">WEEKLY BETTING INTELLIGENCE</p><h2 id="daily-edge-heading">The Daily Edge</h2><p>{data?.window.label ?? "NFL + college football trends from available data."}</p></div><Link href="/daily-edge" className="edge-all-link">All insights <span aria-hidden="true">→</span></Link></div>
    {loading ? <p className="edge-state">Loading this week’s game notes…</p> : error ? <p className="edge-state">Game history is temporarily unavailable.</p> : data?.insights.length ? <div className="edge-grid">{data.insights.slice(0, 3).map((nugget) => <NuggetCard key={nugget.id} nugget={nugget} />)}</div> : <p className="edge-state">No strong, data-supported trends for this week’s available matchups yet.</p>}
  </section>;
}

export default function DailyEdgeFeed() {
  const { data, loading, error } = useWeeklyEdge();
  return <main className="edge-page"><div className="edge-page-inner">
    <div className="edge-page-hero"><p className="edge-eyebrow">PARLAY MONEY MACHINE · WEEKLY INTELLIGENCE</p><h1>The Daily Edge</h1><p>Score-backed NFL and college football trends, ATS and totals records, and captured line movement. Descriptive context, not predictions or guarantees.</p></div>
    <div className="edge-day-label"><span>{data?.window.label ?? "Current Pacific week"}</span><span>{data ? `${data.upcomingGameCount} upcoming · ${data.weeklyGameCount} games this week` : "NFL + NCAAF"}</span></div>
    {loading ? <p className="edge-state">Loading this week’s game notes…</p> : error || !data ? <p className="edge-state">Game history is temporarily unavailable. Please try again later.</p> : data.insights.length ? [
      { key: "nfl", label: "NFL", nuggets: data.insights.filter((item) => item.sport === "nfl") },
      { key: "ncaaf", label: "College football · NCAAF", nuggets: data.insights.filter((item) => item.sport === "ncaaf") },
    ].filter((group) => group.nuggets.length > 0).map((group) => <section className="edge-sport-group" key={group.key} aria-labelledby={`edge-${group.key}-heading`}><h2 id={`edge-${group.key}-heading`}>{group.label}</h2><div className="edge-grid edge-grid-full">{group.nuggets.map((nugget) => <NuggetCard key={nugget.id} nugget={nugget} />)}</div></section>) : <div className="edge-empty"><span aria-hidden="true">✳</span><h2>No standout nuggets this week</h2><p>Available results and odds history do not support a strong trend for the upcoming matchups. We show fewer insights instead of filling the board with weak claims.</p></div>}
    {data && <div className="edge-disclosure">{data.health.dataStale && <p className="edge-stale">Schedule or score sync is older than 36 hours. Check the game sync status before relying on these notes.</p>}<p>Last odds sync: {data.health.lastOddsSyncAt ? new Date(data.health.lastOddsSyncAt).toLocaleString() : "not reported"} · Last score sync: {data.health.lastScoreSyncAt ? new Date(data.health.lastScoreSyncAt).toLocaleString() : "not reported"} · Last trend calculation: {data.health.lastTrendCalculationAt ? new Date(data.health.lastTrendCalculationAt).toLocaleString() : "not run"}.</p>{data.health.lastOddsFailureAt && <p>Latest odds sync failure ({new Date(data.health.lastOddsFailureAt).toLocaleString()}): {data.health.lastOddsFailure ?? "unknown error"}</p>}{data.health.lastScoreFailureAt && <p>Latest score sync failure ({new Date(data.health.lastScoreFailureAt).toLocaleString()}): {data.health.lastScoreFailure ?? "unknown error"}</p>}{data.health.lastTrendFailureAt && <p>Latest trend calculation failure ({new Date(data.health.lastTrendFailureAt).toLocaleString()}): {data.health.lastTrendFailure ?? "unknown error"}</p>}<p>{data.collegeCoverage}</p><p>{data.oddsHistoryAvailable ? `Odds movement is available from snapshots first collected ${data.earliestCapturedAt ? formatDate(data.earliestCapturedAt) : "during the current collection period"}; it does not represent pre-collection opening lines.` : "Odds history is not available yet. The odds snapshot database migration must be applied before ATS, totals, or line movement insights can appear."}</p><p>ATS and over/under records use captured pregame sportsbook lines and completed scores. Coverage starts when snapshots begin; results may be thin until a team has enough recorded games. Explanations use deterministic summaries; no AI provider is configured. No injury or news feed is connected.</p></div>}
  </div></main>;
}

type MatchupData = {
  teams: Array<{ team: string; last5: { wins: number; losses: number; ties: number; pointsFor: number; pointsAgainst: number; sampleSize: number }; last10: { wins: number; losses: number; ties: number; sampleSize: number }; streak: { result: "W" | "L" | "T"; count: number } | null; home: { wins: number; losses: number; ties: number; sampleSize: number }; away: { wins: number; losses: number; ties: number; sampleSize: number }; ats: { covers: number; misses: number; pushes: number; sampleSize: number }; totals: { covers: number; misses: number; pushes: number; sampleSize: number }; latestFinal: string | null }>;
  headToHead: Array<{ id: string; starts_at: string; away_team: string; away_score: number; home_team: string; home_score: number }>;
  currentLines: Record<string, Array<{ market: string; sportsbook: string; label: string; observedAt: string; values: Array<{ name: string; point: number | null; price: number | null }> }>>;
  lineMovement: EdgeNugget[];
  oddsHistoryAvailable: boolean;
};

export function MatchupIntelligence({ game }: { game: { id: string } }) {
  const [data, setData] = useState<MatchupData | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/daily-edge?gameId=${encodeURIComponent(game.id)}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => { if (!response.ok) throw new Error("Matchup data unavailable"); return response.json() as Promise<MatchupData>; })
      .then(setData).catch(() => { if (!controller.signal.aborted) setData(null); })
      .finally(() => { if (!controller.signal.aborted) setLoaded(true); });
    return () => controller.abort();
  }, [game.id]);
  const formatOdds = (price: number | null) => price === null ? "—" : price > 0 ? `+${price}` : String(price);
  const formatRecord = (record: { wins: number; losses: number; ties?: number }) => `${record.wins}–${record.losses}${record.ties ? `–${record.ties}` : ""}`;
  return <section className="matchup-intelligence" aria-labelledby="matchup-intelligence-heading">
    <div className="edge-heading-row"><div><p className="edge-eyebrow">SCORES + CAPTURED ODDS</p><h2 id="matchup-intelligence-heading">Betting intelligence</h2></div></div>
    {!loaded ? <p className="edge-state">Loading matchup history…</p> : !data ? <p className="edge-state">Matchup history is temporarily unavailable.</p> : <>
      <div className="form-grid">{data.teams.map((team) => <article className="form-card" key={team.team}><p className="edge-category">{team.team}</p><h3>Last {team.last5.sampleSize}: {formatRecord(team.last5)}</h3><p>Last {team.last10.sampleSize}: {formatRecord(team.last10)}</p><p>{team.last5.pointsFor.toFixed(1)} scored · {team.last5.pointsAgainst.toFixed(1)} allowed per game</p><p>Home: {formatRecord(team.home)} ({team.home.sampleSize}) · Away: {formatRecord(team.away)} ({team.away.sampleSize})</p>{team.streak && <p className="form-streak">Current streak: {team.streak.count} {team.streak.result === "W" ? "win" : team.streak.result === "T" ? "tie" : "loss"}{team.streak.count === 1 ? "" : "s"}</p>}{team.ats.sampleSize > 0 && <p>ATS: {team.ats.covers}–{team.ats.misses}{team.ats.pushes ? `–${team.ats.pushes} pushes` : ""} ({team.ats.sampleSize} games)</p>}{team.totals.sampleSize > 0 && <p>O/U: {team.totals.covers} over · {team.totals.misses} under ({team.totals.sampleSize} games)</p>}{team.latestFinal && <small>Latest final: {new Date(team.latestFinal).toLocaleDateString()}</small>}</article>)}</div>
      {data.lineMovement.length > 0 && <div className="h2h-history"><h3>Captured line movement</h3>{data.lineMovement.map((item) => <p className="edge-reason" key={item.id}><strong>{item.headline}.</strong> {item.detail} {item.reason}</p>)}</div>}
      {data.headToHead.length > 0 && <div className="h2h-history"><h3>Recent head-to-head</h3><ul>{data.headToHead.map((past) => <li key={past.id}><span>{new Date(past.starts_at).toLocaleDateString()}</span><strong>{past.away_team} {past.away_score} — {past.home_score} {past.home_team}</strong></li>)}</ul></div>}
      {data.oddsHistoryAvailable && <div className="h2h-history"><h3>Latest captured lines</h3>{[...data.currentLines.spreads ?? [], ...data.currentLines.totals ?? [], ...data.currentLines.moneylines ?? []].map((line) => <p className="edge-line-row" key={`${line.market}-${line.sportsbook}-${line.observedAt}`}><strong>{line.market === "h2h" ? "Moneyline" : line.market === "spreads" ? "Spread" : "Total"} · {line.label}:</strong> {line.values.map((value) => `${value.name} ${value.point !== null ? value.point : formatOdds(value.price)}`).join(" · ")} <small>as of {new Date(line.observedAt).toLocaleString()}</small></p>)}</div>}
      <p className="edge-disclosure">Recent form and head-to-head use completed scores. ATS and totals use recorded pregame lines, and only games with odds captured by this system count. Captured movement begins with the first recorded snapshot; it may not include the true opening line. {data.oddsHistoryAvailable ? "" : "Odds snapshots are unavailable until the database migration is applied."}</p>
    </>}
  </section>;
}
