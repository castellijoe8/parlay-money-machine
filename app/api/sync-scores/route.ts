import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
);

const SCORE_INTERVAL_MINUTES = 15;

export async function GET() {
  const apiKey = process.env.ODDS_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "ODDS_API_KEY is not configured" },
      { status: 500 }
    );
  }

  // Check when scores were last synced.
  const { data: syncState, error: syncError } = await supabase
    .from("sync_state")
    .select("last_run_at")
    .eq("key", "scores")
    .single();

  if (syncError) {
    return NextResponse.json(
      {
        error: "Could not read score sync state",
        details: syncError.message,
      },
      { status: 500 }
    );
  }

  const now = Date.now();

  // Only hit The Odds API every 15 minutes globally.
  if (syncState.last_run_at) {
    const lastRun = new Date(syncState.last_run_at).getTime();
    const minutesSinceLastRun = (now - lastRun) / 60000;

    if (minutesSinceLastRun < SCORE_INTERVAL_MINUTES) {
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: "Score check is not due yet",
        minutes_until_next_check: Math.ceil(
          SCORE_INTERVAL_MINUTES - minutesSinceLastRun
        ),
      });
    }
  }

  // Record the sync time before making the API request.
  await supabase
    .from("sync_state")
    .update({
      last_run_at: new Date().toISOString(),
    })
    .eq("key", "scores");

  // Pull NCAAF scores from the last 3 days.
  const scoresUrl =
    `https://api.the-odds-api.com/v4/sports/americanfootball_ncaaf/scores/` +
    `?apiKey=${apiKey}&daysFrom=3`;

  const response = await fetch(scoresUrl, {
    cache: "no-store",
  });

  if (!response.ok) {
    const errorText = await response.text();

    return NextResponse.json(
      {
        error: "Scores API request failed",
        details: errorText,
      },
      { status: response.status }
    );
  }

  const games = await response.json();

  let updated = 0;
  let liveGames = 0;
  let gamesScored = 0;
  let gamesNotInDatabase = 0;

  for (const game of games) {
    const completed = game.completed === true;

    const homeScore =
      game.scores?.find(
        (score: { name: string; score: string }) =>
          score.name === game.home_team
      )?.score ?? null;

    const awayScore =
      game.scores?.find(
        (score: { name: string; score: string }) =>
          score.name === game.away_team
      )?.score ?? null;

    const hasScores = homeScore !== null && awayScore !== null;

    if (!completed && hasScores) {
      liveGames++;
    }

    const gameStatus = completed
      ? "final"
      : hasScores
      ? "live"
      : "scheduled";

    const { data: updatedGame, error } = await supabase
      .from("games")
      .update({
        home_score: homeScore !== null ? Number(homeScore) : null,
        away_score: awayScore !== null ? Number(awayScore) : null,
        status: gameStatus,
      })
      .eq("external_id", game.id)
      .select("id, status")
      .maybeSingle();

    if (error) {
      console.error("Error updating game:", error);
      continue;
    }

    if (!updatedGame) {
      gamesNotInDatabase++;
      continue;
    }

    updated++;

    // Automatically settle wagers once the game is final.
    if (completed && updatedGame.status === "final") {
      const { error: scoreError } = await supabase.rpc("score_game", {
        game_id_input: updatedGame.id,
      });

      if (scoreError) {
        console.error(
          `Error scoring game ${updatedGame.id}:`,
          scoreError
        );
      } else {
        gamesScored++;
      }
    }
  }

  return NextResponse.json({
    success: true,
    skipped: false,
    games_found: games.length,
    games_updated: updated,
    live_games: liveGames,
    games_scored: gamesScored,
    games_not_in_database: gamesNotInDatabase,
  });
}