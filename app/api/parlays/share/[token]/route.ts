import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: "Server configuration is incomplete." }, { status: 500 });
  const { token } = await context.params;
  const { data, error } = await admin.from("parlay_wagers").select("combined_american_odds,legs:parlay_legs(id,game_id,sport,market,selection,line,american_odds,game:games(id,sport,away_team,home_team,starts_at,status,home_score,away_score,spread,spread_home,spread_odds_away,spread_odds_home,total,total_odds_over,total_odds_under,moneyline_away,moneyline_home))").eq("share_token", token).maybeSingle();
  if (error || !data) return NextResponse.json({ error: "This shared parlay is unavailable." }, { status: 404 });
  const legs = data.legs as Array<{ game_id?: string }>;
  const sameGamePricing = new Set(legs.map((leg) => leg.game_id)).size < legs.length;
  return NextResponse.json({ combinedAmericanOdds: data.combined_american_odds, sameGamePricing, legs: data.legs });
}
