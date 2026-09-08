import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
);

const SATURDAY_INTERVAL_MINUTES = 60;
const DAILY_INTERVAL_MINUTES = 24 * 60;

function getPacificDateParts() {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  });

  const parts = formatter.formatToParts(new Date());

  const weekday = parts.find((part) => part.type === "weekday")?.value;
  const hour = Number(
    parts.find((part) => part.type === "hour")?.value ?? 0
  );

  return {
    weekday,
    hour,
  };
}

function isSaturdayOddsWindow() {
  const { weekday, hour } = getPacificDateParts();

  return weekday === "Sat" && hour >= 8 && hour < 23;
}

function isOddsSyncDue(lastRunAt: string | null) {
  if (!lastRunAt) {
    return true;
  }

  const lastRun = new Date(lastRunAt).getTime();
  const minutesSinceLastRun =
    (Date.now() - lastRun) / 60000;

  if (isSaturdayOddsWindow()) {
    return minutesSinceLastRun >= SATURDAY_INTERVAL_MINUTES;
  }

  return minutesSinceLastRun >= DAILY_INTERVAL_MINUTES;
}

export async function GET() {
  const apiKey = process.env.ODDS_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "ODDS_API_KEY is not configured" },
      { status: 500 }
    );
  }

  // Check the global odds sync timestamp.
  const { data: syncState, error: syncError } = await supabase
    .from("sync_state")
    .select("last_run_at")
    .eq("key", "odds")
    .single();

  if (syncError) {
    return NextResponse.json(
      {
        error: "Could not read odds sync state",
        details: syncError.message,
      },
      { status: 500 }
    );
  }

  // Do not call The Odds API unless the refresh is due.
  if (!isOddsSyncDue(syncState.last_run_at)) {
    const { weekday, hour } = getPacificDateParts();

    const interval = isSaturdayOddsWindow()
      ? SATURDAY_INTERVAL_MINUTES
      : DAILY_INTERVAL_MINUTES;

    const lastRun = syncState.last_run_at
      ? new Date(syncState.last_run_at).getTime()
      : Date.now();

    const minutesSinceLastRun =
      (Date.now() - lastRun) / 60000;

    return NextResponse.json({
      success: true,
      skipped: true,
      reason: "Odds refresh is not due yet",
      weekday,
      pacific_hour: hour,
      minutes_until_next_refresh: Math.ceil(
        interval - minutesSinceLastRun
      ),
    });
  }

  // Record the sync time before making the API request.
  await supabase
    .from("sync_state")
    .update({
      last_run_at: new Date().toISOString(),
    })
    .eq("key", "odds");

  // Pull current NCAAF odds.
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
  let updated = 0;
  let skipped = 0;

  for (const game of games) {
    const bookmakers = game.bookmakers || [];

    const bookmaker =
      bookmakers.find(
        (bookmaker: any) =>
          bookmaker.key === "draftkings"
      ) || bookmakers[0];

    if (!bookmaker) {
      skipped++;
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
    const moneylineOutcomes =
      moneylineMarket?.outcomes || [];

    const awaySpread = spreadOutcomes.find(
      (outcome: any) =>
        outcome.name === game.away_team
    );

    const homeSpread = spreadOutcomes.find(
      (outcome: any) =>
        outcome.name === game.home_team
    );

    const overOutcome = totalOutcomes.find(
      (outcome: any) =>
        outcome.name === "Over"
    );

    const underOutcome = totalOutcomes.find(
      (outcome: any) =>
        outcome.name === "Under"
    );

    const awayMoneyline = moneylineOutcomes.find(
      (outcome: any) =>
        outcome.name === game.away_team
    );

    const homeMoneyline = moneylineOutcomes.find(
      (outcome: any) =>
        outcome.name === game.home_team
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

    const oddsData = {
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
    };

    // Check whether this game already exists.
    const { data: existingGame, error: lookupError } =
      await supabase
        .from("games")
        .select("id, status")
        .eq("external_id", game.id)
        .maybeSingle();

    if (lookupError) {
      console.error(
        "Error looking up game:",
        lookupError
      );
      skipped++;
      continue;
    }

    if (existingGame) {
      // Update odds only.
      // This intentionally preserves live/final status
      // and existing scores.
      const { error: updateError } = await supabase
        .from("games")
        .update(oddsData)
        .eq("id", existingGame.id);

      if (updateError) {
        console.error(
          "Error updating odds:",
          updateError
        );
        skipped++;
        continue;
      }

      updated++;
    } else {
      // New game: create it as scheduled.
      const { error: insertError } = await supabase
        .from("games")
        .insert({
          external_id: game.id,
          sport: "ncaaf",
          ...oddsData,
          status: "scheduled",
        });

      if (insertError) {
        console.error(
          "Error importing game:",
          insertError
        );
        skipped++;
        continue;
      }

      imported++;
    }
  }

  return NextResponse.json({
    success: true,
    skipped: false,
    games_found: games.length,
    games_imported: imported,
    games_updated: updated,
    games_skipped: skipped,
    saturday_hourly_window: isSaturdayOddsWindow(),
  });
}
