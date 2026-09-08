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
    `https://api.the-odds-api.com/v4/sports/americanfootball_ncaaf/odds/?apiKey=${apiKey}&regions=us&markets=spreads,totals,h2h&oddsFormat=american`,
    {
      cache: "no-store",
    }
  );

  if (!response.ok) {
    const errorText = await response.text();

    return NextResponse.json(
      {
        error: "Odds API request failed",
        details: errorText,
      },
      { status: response.status }
    );
  }

  const games = await response.json();

  let imported = 0;

  for (const game of games) {
    const bookmakers = game.bookmakers || [];

    const bookmaker =
      bookmakers.find(
        (bookmaker: any) => bookmaker.key === "draftkings"
      ) || bookmakers[0];

    if (!bookmaker) {
      continue;
    }

    const markets = bookmaker.markets || [];

    const spreadMarket = markets.find(
      (market: any) => market.key === "spreads"
    );

    const totalMarket = markets.find(
      (market: any) => market.key === "totals"
    );

    const moneylineMarket = markets.find(
      (market: any) => market.key === "h2h"
    );

    const spreadOutcomes = spreadMarket?.outcomes || [];
    const totalOutcomes = totalMarket?.outcomes || [];
    const moneylineOutcomes = moneylineMarket?.outcomes || [];

    const awaySpread = spreadOutcomes.find(
      (outcome: any) => outcome.name === game.away_team
    );

    const homeSpread = spreadOutcomes.find(
      (outcome: any) => outcome.name === game.home_team
    );

    const overOutcome = totalOutcomes.find(
      (outcome: any) => outcome.name === "Over"
    );

    const underOutcome = totalOutcomes.find(
      (outcome: any) => outcome.name === "Under"
    );

    const awayMoneyline = moneylineOutcomes.find(
      (outcome: any) => outcome.name === game.away_team
    );

    const homeMoneyline = moneylineOutcomes.find(
      (outcome: any) => outcome.name === game.home_team
    );

    const spread =
      awaySpread?.point !== undefined
        ? Number(awaySpread.point)
        : null;

    const spreadHome =
      homeSpread?.point !== undefined
        ? Number(homeSpread.point)
        : null;

    const spreadOddsAway =
      awaySpread?.price !== undefined
        ? Number(awaySpread.price)
        : null;

    const spreadOddsHome =
      homeSpread?.price !== undefined
        ? Number(homeSpread.price)
        : null;

    const total =
      overOutcome?.point !== undefined
        ? Number(overOutcome.point)
        : null;

    const totalOddsOver =
      overOutcome?.price !== undefined
        ? Number(overOutcome.price)
        : null;

    const totalOddsUnder =
      underOutcome?.price !== undefined
        ? Number(underOutcome.price)
        : null;

    const moneylineAway =
      awayMoneyline?.price !== undefined
        ? Number(awayMoneyline.price)
        : null;

    const moneylineHome =
      homeMoneyline?.price !== undefined
        ? Number(homeMoneyline.price)
        : null;

    const { error } = await supabase
      .from("games")
      .upsert(
        {
          external_id: game.id,
          sport: "ncaaf",
          starts_at: game.commence_time,
          away_team: game.away_team,
          home_team: game.home_team,

          spread,
          spread_home: spreadHome,

          spread_odds_away: spreadOddsAway,
          spread_odds_home: spreadOddsHome,

          total,

          total_odds_over: totalOddsOver,
          total_odds_under: totalOddsUnder,

          moneyline_away: moneylineAway,
          moneyline_home: moneylineHome,

          status: "scheduled",
        },
        {
          onConflict: "external_id",
        }
      );

    if (error) {
      console.error("Error importing game:", error);
      continue;
    }

    imported++;
  }

  return NextResponse.json({
    success: true,
    games_found: games.length,
    games_imported: imported,
  });
}