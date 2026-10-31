import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export async function GET() {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    return NextResponse.json(
      { success: false, error: "Supabase server configuration is incomplete" },
      { status: 500 }
    );
  }

  const { data: games, error } = await supabase
    .from("games")
    .select("id, external_id, home_team, away_team, home_score, away_score, status")
    .eq("status", "final")
    .not("home_score", "is", null)
    .not("away_score", "is", null);

  if (error) {
    return NextResponse.json(
      { success: false, error: "Could not load final games", details: error.message },
      { status: 500 }
    );
  }

  let gamesScored = 0;
  const errors: Array<{ game_id: string; error: string }> = [];

  for (const game of games ?? []) {
    const { error: scoreError } = await supabase.rpc("score_game", {
      game_id_input: game.id,
    });

    if (scoreError) {
      errors.push({ game_id: game.id, error: scoreError.message });
    } else {
      gamesScored++;
    }
  }

  return NextResponse.json({
    success: errors.length === 0,
    games_found: games?.length ?? 0,
    games_scored: gamesScored,
    errors,
    message:
      errors.length === 0
        ? "Historical final games have been processed."
        : "Backfill completed with some errors.",
  });
}
