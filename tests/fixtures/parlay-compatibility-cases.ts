import type { Selection } from "../../lib/betting.ts";
const gameId = "aaaaaaaa-0000-4000-8000-000000000001";
const spread: Selection = { gameId, sport: "ncaaf", pick: "Notre Dame", betType: "Spread", line: -6.5, odds: -110 };
const awaySpread: Selection = { ...spread, pick: "Opponent", line: 6.5 };
const moneyline: Selection = { ...spread, betType: "Moneyline", line: null, odds: -180 };
const awayMoneyline: Selection = { ...moneyline, pick: "Opponent", odds: 150 };
const over: Selection = { ...spread, betType: "Total", pick: "Over", line: 48.5 };
const under: Selection = { ...over, pick: "Under" };
export const compatiblePairs = [spread, awaySpread, moneyline, awayMoneyline].flatMap((side) => [[side, over], [side, under]]);
export const incompatibleGroups = [
  { legs: [spread, moneyline], code: "conflicting_side_markets" },
  { legs: [spread, awayMoneyline], code: "conflicting_side_markets" },
  { legs: [awaySpread, moneyline], code: "conflicting_side_markets" },
  { legs: [awaySpread, awayMoneyline], code: "conflicting_side_markets" },
  { legs: [spread, awaySpread], code: "repeated_spread" },
  { legs: [moneyline, awayMoneyline], code: "repeated_moneyline" },
  { legs: [over, under], code: "conflicting_totals" },
  { legs: [spread, spread], code: "duplicate_selection" },
  { legs: [over, { ...over, line: 49.5 }], code: "repeated_total" },
  { legs: [spread, { ...spread, line: -7.5 }], code: "repeated_spread" },
  { legs: [spread, over, under], code: "conflicting_totals" },
  { legs: [spread, over, moneyline], code: "conflicting_side_markets" },
];
