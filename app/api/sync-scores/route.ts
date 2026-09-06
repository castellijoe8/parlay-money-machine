import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
);

export async function GET() {
  const apiKey = process.env.ODDS_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "ODDS_API_KEY is not configured" },
      { status: 500 }
    );
  }

  const response = await fetch(
    `https://api.the-odds-api.com/v4/sports/americanfootball_ncaaf/scores/?apiKey=${apiKey}&daysFrom=3`,
    {
      cache: "no-store",
    }
  );

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
  let scored = 0;

  for (const game of games) {
    const completed = game.completed === true;

    const homeScore =
      game.scores?.find(
        (score: any) => score.name === game.home_team
      )?.score ?? null;

    const awayScore =
      game.scores?.find(
        (score: any) => score.name === game.away_team
      )?.score ?? null;

    const { data: updatedGame, error } = await supabase
      .from("games")
      .update({
        home_score:
          homeScore !== null ? Number(homeScore) : null,
        away_score:
          awayScore !== null ? Number(awayScore) : null,
        status: completed ? "final" : "scheduled",
      })
      .eq("external_id", game.id)
      .select("id, status")
      .single();

    if (error) {
      console.error("Error updating game:", error);
      continue;
    }

    updated++;

    if (completed && updatedGame.status === "final") {
      const { error: scoreError } = await supabase.rpc(
        "score_game",
        {
          game_id_input: updatedGame.id,
        }
      );

      if (scoreError) {
        console.error("Error scoring game:", scoreError);
        continue;
      }

      scored++;
    }
  }

  return NextResponse.json({
    success: true,
    games_found: games.length,
    games_updated: updated,
    games_scored: scored,
  });
}