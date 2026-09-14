import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { SPORT_API_CONFIG, SPORTS, type SupportedSport } from "@/lib/sports";
import { getSyncMinimumIntervalMinutes, isSyncDue } from "@/lib/sync-schedule";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!);

type OddsApiGame = {
  id: string;
  commence_time: string;
  away_team: string;
  home_team: string;
  bookmakers?: Array<{
    key: string;
    markets?: Array<{ key: string; outcomes?: Array<{ name: string; point?: number; price?: number }> }>;
  }>;
};

async function syncSportOdds(sport: SupportedSport, apiKey: string) {
  const response = await fetch(
    `https://api.the-odds-api.com/v4/sports/${SPORT_API_CONFIG[sport].oddsApiKey}/odds/?apiKey=${apiKey}&regions=us&markets=spreads,totals,h2h&oddsFormat=american`,
    { cache: "no-store" }
  );
  if (!response.ok) throw new Error(await response.text());

  const games = (await response.json()) as OddsApiGame[];
  let imported = 0;
  let updated = 0;
  let skipped = 0;

  for (const game of games) {
    const bookmaker = game.bookmakers?.find((candidate) => candidate.key === "draftkings") ?? game.bookmakers?.[0];
    if (!bookmaker) {
      skipped++;
      continue;
    }

    const spreadOutcomes = bookmaker.markets?.find((market) => market.key === "spreads")?.outcomes ?? [];
    const totalOutcomes = bookmaker.markets?.find((market) => market.key === "totals")?.outcomes ?? [];
    const moneylineOutcomes = bookmaker.markets?.find((market) => market.key === "h2h")?.outcomes ?? [];
    const awaySpread = spreadOutcomes.find((outcome) => outcome.name === game.away_team);
    const homeSpread = spreadOutcomes.find((outcome) => outcome.name === game.home_team);
    const overOutcome = totalOutcomes.find((outcome) => outcome.name === "Over");
    const underOutcome = totalOutcomes.find((outcome) => outcome.name === "Under");
    const awayMoneyline = moneylineOutcomes.find((outcome) => outcome.name === game.away_team);
    const homeMoneyline = moneylineOutcomes.find((outcome) => outcome.name === game.home_team);
    const numberOrNull = (value: number | undefined) => value === undefined ? null : Number(value);
    const oddsData = {
      starts_at: game.commence_time,
      away_team: game.away_team,
      home_team: game.home_team,
      spread: numberOrNull(awaySpread?.point),
      spread_home: numberOrNull(homeSpread?.point),
      spread_odds_away: numberOrNull(awaySpread?.price),
      spread_odds_home: numberOrNull(homeSpread?.price),
      total: numberOrNull(overOutcome?.point),
      total_odds_over: numberOrNull(overOutcome?.price),
      total_odds_under: numberOrNull(underOutcome?.price),
      moneyline_away: numberOrNull(awayMoneyline?.price),
      moneyline_home: numberOrNull(homeMoneyline?.price),
    };

    const { data: existingGame, error: lookupError } = await supabase
      .from("games")
      .select("id")
      .eq("external_id", game.id)
      .maybeSingle();
    if (lookupError) {
      console.error("Error looking up game:", lookupError);
      skipped++;
      continue;
    }

    const error = existingGame
      ? (await supabase.from("games").update(oddsData).eq("id", existingGame.id)).error
      : (await supabase.from("games").insert({ external_id: game.id, sport, ...oddsData, status: "scheduled" })).error;
    if (error) {
      console.error("Error saving odds:", error);
      skipped++;
    } else if (existingGame) {
      updated++;
    } else {
      imported++;
    }
  }

  return { games_found: games.length, games_imported: imported, games_updated: updated, games_skipped: skipped };
}

export async function GET() {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "ODDS_API_KEY is not configured" }, { status: 500 });

  const { data: syncState, error: syncError } = await supabase.from("sync_state").select("last_run_at").eq("key", "odds").single();
  if (syncError) return NextResponse.json({ error: "Could not read odds sync state", details: syncError.message }, { status: 500 });

  if (!isSyncDue(syncState.last_run_at)) {
    return NextResponse.json({ success: true, skipped: true, reason: "Odds refresh is not due yet", minimum_interval_minutes: getSyncMinimumIntervalMinutes() });
  }

  try {
    const results = Object.fromEntries(await Promise.all(SPORTS.map(async (sport) => [sport, await syncSportOdds(sport, apiKey)])));
    await supabase.from("sync_state").update({ last_run_at: new Date().toISOString() }).eq("key", "odds");
    return NextResponse.json({ success: true, skipped: false, sports: results });
  } catch (error) {
    console.error("Odds API request failed:", error);
    return NextResponse.json({ error: "Odds API request failed", details: error instanceof Error ? error.message : "Unknown error" }, { status: 502 });
  }
}
