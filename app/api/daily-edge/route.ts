import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import {
  atsRecord,
  buildWeeklyNuggets,
  indexOddsSnapshots,
  latestPregameLines,
  sportsbookLabel,
  teamForm,
  teamStreak,
  totalsRecord,
  type FinalGame,
  type OddsSnapshot,
} from "@/lib/daily-edge";
import { getCurrentCollegeSeasonStart, getPacificWeekWindow } from "@/lib/daily-edge-window";

const SPORTS = ["nfl", "ncaaf"] as const;
const GAME_FIELDS = "id, sport, away_team, home_team, starts_at, status, home_score, away_score, spread, spread_home, spread_odds_away, spread_odds_home, total, total_odds_over, total_odds_under, moneyline_away, moneyline_home, updated_at";
const FINAL_FIELDS = "id, sport, away_team, home_team, starts_at, status, home_score, away_score, spread, spread_home, total, updated_at";
const SNAPSHOT_FIELDS = "id, game_id, sport, sportsbook, market, observed_at, provider_updated_at, outcomes, is_earliest, observation_count";

async function loadFinals(client: SupabaseClient) {
  const results = await Promise.all(SPORTS.map((sport) =>
    (sport === "ncaaf"
      ? client.from("games").select(FINAL_FIELDS).gte("starts_at", getCurrentCollegeSeasonStart())
      : client.from("games").select(FINAL_FIELDS))
      .eq("sport", sport).eq("status", "final").not("home_score", "is", null).not("away_score", "is", null).order("starts_at", { ascending: false }).limit(1500)
  ));
  const error = results.find((result) => result.error)?.error;
  return {
    error,
    games: results.flatMap((result) => (result.data ?? []) as FinalGame[]).sort((a, b) => Date.parse(b.starts_at) - Date.parse(a.starts_at)),
  };
}

function relevantFinals(games: FinalGame[], teams: Set<string>) {
  return games.filter((game) => teams.has(game.home_team) || teams.has(game.away_team));
}

function recentTeamGameIds(games: FinalGame[], teams: Set<string>, maxPerTeam = 10) {
  const countByTeam = new Map<string, number>();
  const ids = new Set<string>();
  for (const game of games) {
    for (const team of [game.home_team, game.away_team]) {
      if (!teams.has(team)) continue;
      const count = countByTeam.get(team) ?? 0;
      if (count < maxPerTeam) {
        ids.add(game.id);
        countByTeam.set(team, count + 1);
      }
    }
  }
  return ids;
}

async function loadOddsEdges(client: SupabaseClient, gameIds: string[]) {
  if (!gameIds.length) {
    const { error } = await client.from("game_odds_snapshot_edges").select("id").limit(1);
    return { snapshots: [] as OddsSnapshot[], error: error ? { code: error.code, message: error.message } : null };
  }
  const chunks: string[][] = [];
  for (let offset = 0; offset < gameIds.length; offset += 80) chunks.push(gameIds.slice(offset, offset + 80));
  const snapshots: OddsSnapshot[] = [];
  for (let offset = 0; offset < chunks.length; offset += 4) {
    const batch = chunks.slice(offset, offset + 4);
    const results = await Promise.all(batch.map(async (ids) => {
      const rows: OddsSnapshot[] = [];
      let pageOffset = 0;
      while (true) {
        const { data, error } = await client.from("game_odds_snapshot_edges").select(SNAPSHOT_FIELDS).in("game_id", ids).order("observed_at", { ascending: true }).range(pageOffset, pageOffset + 999);
        if (error) return { rows, error };
        rows.push(...((data ?? []) as OddsSnapshot[]));
        if ((data?.length ?? 0) < 1000) break;
        pageOffset += 1000;
      }
      return { rows, error: null };
    }));
    for (const result of results) {
      snapshots.push(...result.rows);
      if (result.error) return { snapshots: [] as OddsSnapshot[], error: result.error };
    }
  }
  return { snapshots, error: null as { code?: string; message: string } | null };
}

function lineDetails(game: FinalGame, snapshots: OddsSnapshot[], market: "spreads" | "totals" | "h2h") {
  const index = indexOddsSnapshots(snapshots);
  return latestPregameLines(game, market, index).map((line) => {
    const values = line.outcomes.map((outcome) => ({
      name: outcome.name,
      point: outcome.point ?? null,
      price: outcome.price ?? null,
    }));
    return { market, sportsbook: line.sportsbook, label: sportsbookLabel(line.sportsbook), observedAt: line.observedAt, values };
  });
}

async function getGameIntelligence(client: SupabaseClient, gameId: string) {
  const { data: game, error: gameError } = await client.from("games").select(GAME_FIELDS).eq("id", gameId).maybeSingle();
  if (gameError) throw new Error(`Could not load matchup: ${gameError.message}`);
  if (!game) return NextResponse.json({ error: "Game not found" }, { status: 404 });
  if (!SPORTS.includes(game.sport as (typeof SPORTS)[number])) return NextResponse.json({ error: "Unsupported sport" }, { status: 400 });

  const sport = game.sport as (typeof SPORTS)[number];
  const historyQuery = sport === "ncaaf"
    ? client.from("games").select(FINAL_FIELDS).gte("starts_at", getCurrentCollegeSeasonStart())
    : client.from("games").select(FINAL_FIELDS);
  const { data: historyData, error: historyError } = await historyQuery.eq("sport", sport).eq("status", "final").not("home_score", "is", null).not("away_score", "is", null).order("starts_at", { ascending: false }).limit(1500);
  if (historyError) throw new Error(`Could not load completed results: ${historyError.message}`);
  const history = (historyData ?? []) as FinalGame[];
  const teams = new Set([game.home_team, game.away_team]);
  const gameIds = [...recentTeamGameIds(history, teams), game.id];
  const oddsResult = await loadOddsEdges(client, gameIds);
  const oddsAvailable = !oddsResult.error;
  const snapshots = oddsResult.snapshots;
  const index = indexOddsSnapshots(snapshots);
  const teamsData = [game.away_team, game.home_team].map((team) => {
    const form5 = teamForm(history, team, sport, 5);
    const form10 = teamForm(history, team, sport, 10);
    const venueRecord = (home: boolean) => {
      const sample = history.filter((past) => home ? past.home_team === team : past.away_team === team);
      const wins = sample.filter((past) => home ? past.home_score! > past.away_score! : past.away_score! > past.home_score!).length;
      const ties = sample.filter((past) => past.home_score === past.away_score).length;
      return { wins, losses: sample.length - wins - ties, ties, sampleSize: sample.length };
    };
    return {
      team,
      last5: { wins: form5.wins, losses: form5.losses, ties: form5.ties, pointsFor: form5.pointsFor, pointsAgainst: form5.pointsAgainst, pointDifferential: form5.pointDifferential, sampleSize: form5.games.length },
      last10: { wins: form10.wins, losses: form10.losses, ties: form10.ties, pointsFor: form10.pointsFor, pointsAgainst: form10.pointsAgainst, pointDifferential: form10.pointDifferential, sampleSize: form10.games.length },
      streak: teamStreak(form10, team),
      home: venueRecord(true),
      away: venueRecord(false),
      ats: atsRecord(history, team, sport, index, 8),
      totals: totalsRecord(history, team, sport, index, 8),
      latestFinal: form10.latestDate,
    };
  });
  const lineMovement = buildWeeklyNuggets([game as FinalGame], history, snapshots).filter((item) => item.category === "LINE MOVEMENT");
  const matchupMeetings = history.filter((past) => (past.home_team === game.home_team && past.away_team === game.away_team) || (past.home_team === game.away_team && past.away_team === game.home_team)).slice(0, 5);
  return NextResponse.json({
    game,
    teams: teamsData,
    headToHead: matchupMeetings,
    currentLines: {
      spreads: lineDetails(game as FinalGame, snapshots, "spreads"),
      totals: lineDetails(game as FinalGame, snapshots, "totals"),
      moneylines: lineDetails(game as FinalGame, snapshots, "h2h"),
    },
    lineMovement,
    oddsHistoryAvailable: oddsAvailable,
    oddsHistoryError: oddsAvailable ? null : oddsResult.error?.message ?? null,
    generatedAt: new Date().toISOString(),
  });
}

export async function GET(request: Request) {
  const client = createSupabaseAdminClient();
  if (!client) return NextResponse.json({ error: "Supabase server configuration is incomplete" }, { status: 500 });
  const gameId = new URL(request.url).searchParams.get("gameId");
  try {
    if (gameId) return await getGameIntelligence(client, gameId);

    const window = getPacificWeekWindow();
    const collegeSeasonStart = getCurrentCollegeSeasonStart();
    const [windowResult, historyResult] = await Promise.all([
      client.from("games").select(GAME_FIELDS).in("sport", [...SPORTS]).gte("starts_at", window.startIso).lt("starts_at", window.endIso).order("starts_at", { ascending: true }),
      loadFinals(client),
    ]);
    if (windowResult.error) throw new Error(`Could not load weekly games: ${windowResult.error.message}`);
    if (historyResult.error) throw new Error(`Could not load completed results: ${historyResult.error.message}`);

    const weeklyGames = (windowResult.data ?? []) as FinalGame[];
    const activeTeams = new Set(weeklyGames.flatMap((game) => [game.away_team, game.home_team]));
    const history = relevantFinals(historyResult.games, activeTeams);
    const snapshotGameIds = new Set(weeklyGames.map((game) => game.id));
    for (const id of recentTeamGameIds(historyResult.games, activeTeams)) snapshotGameIds.add(id);
    const oddsResult = await loadOddsEdges(client, [...snapshotGameIds]);
    if (oddsResult.error) console.error("Daily Edge odds history is unavailable:", oddsResult.error);
    const [syncState, latestRun, latestFailure, latestOddsFailure, latestScoresFailure] = await Promise.all([
      client.from("sync_state").select("key, last_run_at").in("key", ["odds", "scores"]),
      client.from("daily_edge_runs").select("finished_at, status, nuggets_count, trigger").eq("status", "succeeded").order("started_at", { ascending: false }).limit(1).maybeSingle(),
      client.from("daily_edge_runs").select("finished_at, error_message").eq("status", "failed").order("started_at", { ascending: false }).limit(1).maybeSingle(),
      client.from("system_job_runs").select("finished_at, error_message").eq("job", "odds").eq("status", "failed").order("started_at", { ascending: false }).limit(1).maybeSingle(),
      client.from("system_job_runs").select("finished_at, error_message").eq("job", "scores").eq("status", "failed").order("started_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    const syncRows = syncState.data ?? [];

    const now = Date.now();
    const upcomingGames = weeklyGames.filter((game) => game.status === "scheduled" && Date.parse(game.starts_at) > now);
    const insights = buildWeeklyNuggets(upcomingGames, history, oddsResult.snapshots);
    return NextResponse.json({
      window: { start: window.startIso, end: window.endIso, timeZone: "America/Los_Angeles", label: window.label },
      generatedAt: new Date().toISOString(),
      weeklyGameCount: weeklyGames.length,
      upcomingGameCount: upcomingGames.length,
      sports: [...SPORTS],
      collegeCoverage: `The configured Odds API NCAAF feed is used without requesting the separate FCS sport key. College trend history is limited to the current season, beginning ${new Date(collegeSeasonStart).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}; earlier seasons that may have included FCS games are excluded.`,
      insights,
      oddsHistoryAvailable: !oddsResult.error,
      oddsHistoryError: oddsResult.error?.message ?? null,
      earliestCapturedAt: oddsResult.snapshots.length ? oddsResult.snapshots.reduce((earliest, snapshot) => Date.parse(snapshot.observed_at) < Date.parse(earliest) ? snapshot.observed_at : earliest, oddsResult.snapshots[0].observed_at) : null,
      health: {
        lastOddsSyncAt: syncRows.find((row) => row.key === "odds")?.last_run_at ?? null,
        lastScoreSyncAt: syncRows.find((row) => row.key === "scores")?.last_run_at ?? null,
        lastOddsFailureAt: latestOddsFailure.data?.finished_at ?? null,
        lastOddsFailure: latestOddsFailure.data?.error_message ?? null,
        lastScoreFailureAt: latestScoresFailure.data?.finished_at ?? null,
        lastScoreFailure: latestScoresFailure.data?.error_message ?? null,
        lastTrendCalculationAt: latestRun.data?.finished_at ?? null,
        lastTrendCalculationStatus: latestRun.data?.status ?? null,
        lastTrendFailureAt: latestFailure.data?.finished_at ?? null,
        lastTrendFailure: latestFailure.data?.error_message ?? null,
        dataStale: [syncRows.find((row) => row.key === "odds")?.last_run_at, syncRows.find((row) => row.key === "scores")?.last_run_at].some((timestamp) => !timestamp || now - Date.parse(timestamp) > 36 * 60 * 60 * 1000),
        lastAiGenerationAt: null,
        explanationMode: "deterministic",
      },
    });
  } catch (error) {
    console.error("Daily Edge API failed:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Daily Edge data could not be loaded" }, { status: 500 });
  }
}
