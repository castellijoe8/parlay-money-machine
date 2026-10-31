import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { calculateParlayOdds, calculatePayout } from "@/lib/parlay-odds";

export const runtime = "nodejs";

type Selection = { gameId: string; pick: string; betType: "Spread" | "Total" | "Moneyline"; line: number | null; odds: number };
const PRICE_COLUMN: Record<Selection["betType"], (game: Record<string, unknown>, selection: Selection) => unknown> = {
  Spread: (game, selection) => game[selection.pick === game.home_team ? "spread_odds_home" : "spread_odds_away"],
  Total: (game, selection) => game[selection.pick === "Over" ? "total_odds_over" : "total_odds_under"],
  Moneyline: (game, selection) => game[selection.pick === game.home_team ? "moneyline_home" : "moneyline_away"],
};
const LINE_COLUMN: Record<Selection["betType"], (game: Record<string, unknown>, selection: Selection) => unknown> = {
  Spread: (game, selection) => game[selection.pick === game.home_team ? "spread_home" : "spread"],
  Total: (game) => game.total,
  Moneyline: () => null,
};

export async function POST(request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const client = createSupabaseAdminClient();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!client || !url || !anonKey) return NextResponse.json({ error: "Server configuration is incomplete." }, { status: 500 });
  if (!token) return NextResponse.json({ error: "Please log in to place a parlay." }, { status: 401 });
  const authClient = (await import("@supabase/supabase-js")).createClient(url, anonKey);
  const { data: { user }, error: authError } = await authClient.auth.getUser(token);
  if (authError || !user) return NextResponse.json({ error: "Your session expired. Please log in again." }, { status: 401 });

  let body: { stake?: number; selections?: Selection[]; idempotencyKey?: string };
  try { body = await request.json() as typeof body; } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const { stake, selections, idempotencyKey } = body;
  if (!idempotencyKey || !/^[0-9a-f-]{36}$/i.test(idempotencyKey)) return NextResponse.json({ error: "Invalid submission key." }, { status: 400 });
  if (!Number.isFinite(stake) || Number(stake) <= 0 || Number(stake) > 100000) return NextResponse.json({ error: "Stake must be greater than zero and no more than $100,000." }, { status: 400 });
  if (!Array.isArray(selections) || selections.length < 2 || selections.length > 20) return NextResponse.json({ error: "A parlay must contain 2 to 20 selections." }, { status: 400 });
  if (selections.some((item) => !item || typeof item.gameId !== "string" || typeof item.pick !== "string" || !["Spread", "Total", "Moneyline"].includes(item.betType) || !Number.isFinite(item.odds) || item.odds === 0 || (item.betType !== "Moneyline" && !Number.isFinite(item.line)))) return NextResponse.json({ error: "One or more selections are invalid." }, { status: 400 });
  if (new Set(selections.map((item) => item.gameId)).size !== selections.length) return NextResponse.json({ error: "Only one selection per game is supported." }, { status: 400 });

  try {
    const { data: games, error } = await client.from("games").select("id, sport, away_team, home_team, starts_at, status, spread, spread_home, spread_odds_away, spread_odds_home, total, total_odds_over, total_odds_under, moneyline_away, moneyline_home").in("id", selections.map((item) => item.gameId));
    if (error || !games || games.length !== selections.length) return NextResponse.json({ error: "One or more games are unavailable." }, { status: 400 });
    const gameById = new Map(games.map((game) => [game.id, game as unknown as Record<string, unknown>]));
    const currentSelections: Record<string, { odds: number | null; line: number | null }> = {};
    for (const selection of selections) {
      const game = gameById.get(selection.gameId)!;
      if (!["nfl", "ncaaf"].includes(String(game.sport))) return NextResponse.json({ error: "Only NFL and NCAA FBS selections are supported." }, { status: 400 });
      if (game.status !== "scheduled" || Date.parse(String(game.starts_at)) <= Date.now()) return NextResponse.json({ error: "Wagering is closed for one or more games." }, { status: 400 });
      const validPick = selection.betType === "Total" ? ["Over", "Under"].includes(selection.pick) : [game.away_team, game.home_team].includes(selection.pick);
      if (!validPick) return NextResponse.json({ error: "A selection does not match its game." }, { status: 400 });
      const price = PRICE_COLUMN[selection.betType](game, selection);
      const line = LINE_COLUMN[selection.betType](game, selection);
      currentSelections[selection.gameId] = {
        odds: Number.isInteger(price) && price !== 0 ? price as number : null,
        line: selection.betType === "Moneyline" ? null : typeof line === "number" ? line : null,
      };
    }
    if (selections.some((selection) => currentSelections[selection.gameId].odds === null || currentSelections[selection.gameId].odds !== selection.odds || currentSelections[selection.gameId].line !== selection.line)) return NextResponse.json({ error: "Prices changed. Review and accept the updated odds and lines before submitting.", currentSelections }, { status: 409 });

    const odds = calculateParlayOdds(selections.map((item) => item.odds));
    const payout = calculatePayout(Number(stake), odds.decimalOdds);
    if (payout.totalReturn > 999999999999.99) return NextResponse.json({ error: "Potential return exceeds the supported wager range." }, { status: 400 });
    const { data: profile } = await client.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
    const legs = selections.map((selection) => ({ ...selection, sport: gameById.get(selection.gameId)?.sport }));
    const { data: wagerId, error: saveError } = await client.rpc("create_parlay_wager", {
      p_user_id: user.id, p_user_name: profile?.display_name?.trim() || "Player", p_stake: stake, p_idempotency_key: idempotencyKey,
      p_combined_american_odds: odds.americanOdds, p_combined_decimal_odds: odds.decimalOdds,
      p_potential_return: payout.totalReturn, p_potential_profit: payout.profit, p_legs: legs,
    });
    if (saveError) {
      if (saveError.message.toLowerCase().includes("price_changed")) {
        const { data: refreshedGames } = await client.from("games").select("id,home_team,spread,spread_home,spread_odds_away,spread_odds_home,total,total_odds_over,total_odds_under,moneyline_away,moneyline_home").in("id", selections.map((item) => item.gameId));
        const refreshedById = new Map((refreshedGames ?? []).map((game) => [game.id, game as unknown as Record<string, unknown>]));
        const latest: typeof currentSelections = {};
        for (const selection of selections) {
          const game = refreshedById.get(selection.gameId);
          if (!game) continue;
          const price = PRICE_COLUMN[selection.betType](game, selection);
          const line = LINE_COLUMN[selection.betType](game, selection);
          latest[selection.gameId] = { odds: Number.isInteger(price) && price !== 0 ? price as number : null, line: selection.betType === "Moneyline" ? null : typeof line === "number" ? line : null };
        }
        return NextResponse.json({ error: "Prices changed before the wager was saved. Review the latest odds and lines, then submit again.", currentSelections: latest }, { status: 409 });
      }
      if (saveError.message.toLowerCase().includes("wagering_closed")) return NextResponse.json({ error: "Wagering is closed for one or more games." }, { status: 409 });
      console.error("Parlay creation failed:", saveError);
      return NextResponse.json({ error: "Unable to save this parlay." }, { status: 500 });
    }
    return NextResponse.json({ id: wagerId, combinedAmericanOdds: odds.americanOdds, combinedDecimalOdds: odds.decimalOdds, potentialReturn: payout.totalReturn, potentialProfit: payout.profit }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.includes("American odds")) return NextResponse.json({ error: "One or more prices are invalid." }, { status: 400 });
    console.error("Parlay submission failed:", error);
    return NextResponse.json({ error: "Unable to submit parlay." }, { status: 500 });
  }
}
