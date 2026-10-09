import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { SPORT_API_CONFIG, SPORTS, type SupportedSport } from "@/lib/sports";
import { getSyncMinimumIntervalMinutes, isSyncDue } from "@/lib/sync-schedule";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!);

type ScoreGame = {
  id: string;
  completed: boolean;
  home_team: string;
  away_team: string;
  scores?: Array<{ name: string; score: string }>;
};

type SyncFailure = {
  stage: "update_game" | "score_game";
  game_id: string;
  away_team: string;
  home_team: string;
  message: string;
};

async function syncSportScores(sport: SupportedSport, apiKey: string) {
  const response = await fetch(
    `https://api.the-odds-api.com/v4/sports/${SPORT_API_CONFIG[sport].oddsApiKey}/scores/?apiKey=${apiKey}&daysFrom=3`,
    { cache: "no-store" }
  );
  if (!response.ok) {
    throw new Error(`${sport} scores request failed (${response.status}): ${await response.text()}`);
  }

  const games = (await response.json()) as ScoreGame[];
  let updated = 0;
  let liveGames = 0;
  let gamesScored = 0;
  let gamesNotInDatabase = 0;
  const failures: SyncFailure[] = [];

  for (const game of games) {
    const homeScore = game.scores?.find((score) => score.name === game.home_team)?.score ?? null;
    const awayScore = game.scores?.find((score) => score.name === game.away_team)?.score ?? null;
    const hasScores = homeScore !== null && awayScore !== null;
    const status = game.completed ? "final" : hasScores ? "live" : "scheduled";
    if (!game.completed && hasScores) liveGames++;

    const { data: updatedGame, error } = await supabase
      .from("games")
      .update({
        home_score: homeScore === null ? null : Number(homeScore),
        away_score: awayScore === null ? null : Number(awayScore),
        status,
      })
      .eq("external_id", game.id)
      .select("id, status")
      .maybeSingle();

    if (error) {
      console.error(`Error updating game ${game.id} (${sport}):`, error);
      failures.push({
        stage: "update_game",
        game_id: game.id,
        away_team: game.away_team,
        home_team: game.home_team,
        message: error.message,
      });
      continue;
    }

    if (!updatedGame) {
      gamesNotInDatabase++;
      continue;
    }

    updated++;
    if (game.completed && updatedGame.status === "final") {
      const { error: scoreError } = await supabase.rpc("score_game", { game_id_input: updatedGame.id });
      if (scoreError) {
        console.error(`Error scoring game ${updatedGame.id} (${sport}):`, scoreError);
        failures.push({
          stage: "score_game",
          game_id: updatedGame.id,
          away_team: game.away_team,
          home_team: game.home_team,
          message: scoreError.message,
        });
      } else {
        gamesScored++;
      }
    }
  }

  return {
    games_found: games.length,
    games_updated: updated,
    live_games: liveGames,
    games_scored: gamesScored,
    games_not_in_database: gamesNotInDatabase,
    failures,
  };
}

export async function GET() {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "ODDS_API_KEY is not configured" }, { status: 500 });

  const { data: syncState, error: syncError } = await supabase
    .from("sync_state")
    .select("last_run_at")
    .eq("key", "scores")
    .single();

  if (syncError) {
    return NextResponse.json(
      { error: "Could not read score sync state", details: syncError.message },
      { status: 500 }
    );
  }

  if (!isSyncDue(syncState.last_run_at)) {
    return NextResponse.json({
      success: true,
      skipped: true,
      reason: "Score check is not due yet",
      minimum_interval_minutes: getSyncMinimumIntervalMinutes(),
    });
  }

  try {
    const settledResults = await Promise.all(
      SPORTS.map(async (sport) => [sport, await syncSportScores(sport, apiKey)] as const)
    );
    const results = Object.fromEntries(settledResults);
    const failures = settledResults.flatMap(([, result]) => result.failures);

    const { error: stateUpdateError } = await supabase
      .from("sync_state")
      .update({ last_run_at: new Date().toISOString() })
      .eq("key", "scores");

    if (stateUpdateError) {
      console.error("Could not update score sync state:", stateUpdateError);
      return NextResponse.json(
        {
          success: false,
          skipped: false,
          error: "Scores were fetched, but score sync state could not be updated",
          details: stateUpdateError.message,
          sports: results,
          failure_count: failures.length,
          failures,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: failures.length === 0,
      skipped: false,
      sports: results,
      failure_count: failures.length,
      failures,
    });
  } catch (error) {
    console.error("Scores API request failed:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Scores API request failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 502 }
    );
  }
}
