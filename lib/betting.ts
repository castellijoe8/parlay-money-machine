import { calculateParlayOdds, calculatePayout } from "./parlay-odds.ts";

export type Selection = {
  gameId: string; sport: "nfl" | "ncaaf"; pick: string;
  betType: "Spread" | "Total" | "Moneyline"; line: number | null; odds: number;
};
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isSelection(value: unknown): value is Selection {
  if (!value || typeof value !== "object") return false;
  const s = value as Selection;
  return typeof s.gameId === "string" && UUID.test(s.gameId)
    && ["nfl", "ncaaf"].includes(s.sport)
    && typeof s.pick === "string" && s.pick.length > 0 && s.pick.length <= 200
    && ["Spread", "Total", "Moneyline"].includes(s.betType)
    && Number.isSafeInteger(s.odds) && s.odds !== 0
    && (s.betType === "Moneyline" ? s.line === null : typeof s.line === "number" && Number.isFinite(s.line));
}
export function selectionKey(s: Pick<Selection, "gameId" | "betType" | "pick" | "line">) {
  return JSON.stringify([s.gameId.toLowerCase(), s.betType.toLowerCase(), s.pick.trim().toLowerCase(), s.line]);
}
export const COMPATIBILITY_MESSAGES = {
  duplicate_selection: "You've already added this exact selection to your parlay.",
  conflicting_side_markets: "You can't combine a spread and moneyline from the same game.",
  conflicting_totals: "You can't select both Over and Under for the same game.",
  repeated_spread: "You've already selected a spread for this game. Choose one team only.",
  repeated_moneyline: "You've already selected a moneyline for this game. Choose one team only.",
  repeated_total: "You've already selected a total for this game.",
} as const;
export const SGP_PRICING_UNAVAILABLE = "Same-game pricing is unavailable. These selections are compatible, but our odds feed does not provide a combined SGP quote. You can keep or edit these legs; this combination cannot be submitted without supported pricing.";

// Compatibility does not depend on pricing eligibility or other placed wagers.
export function compatibilityIssue(selections: Selection[]): keyof typeof COMPATIBILITY_MESSAGES | null {
  for (let i = 0; i < selections.length; i++) {
    for (let j = i + 1; j < selections.length; j++) {
      const a = selections[i], b = selections[j];
      if (a.gameId.toLowerCase() !== b.gameId.toLowerCase()) continue;
      if (selectionKey(a) === selectionKey(b)) return "duplicate_selection";
      const marketA = a.betType.toLowerCase(), marketB = b.betType.toLowerCase();
      if (marketA === marketB) {
        if (marketA === "total") return a.pick.toLowerCase() !== b.pick.toLowerCase() ? "conflicting_totals" : "repeated_total";
        return marketA === "spread" ? "repeated_spread" : "repeated_moneyline";
      }
      // Team names do not decide compatibility: a game has one side slot,
      // shared by spread and moneyline, plus one independent total slot.
      if (marketA !== "total" && marketB !== "total") return "conflicting_side_markets";
    }
  }
  return null;
}
export function compatibilityError(selections: Selection[]): string | null {
  const issue = compatibilityIssue(selections);
  return issue ? COMPATIBILITY_MESSAGES[issue] : null;
}
export function priceParlay(selections: Selection[]) {
  const incompatible = compatibilityError(selections);
  if (incompatible) throw new Error(incompatible);
  if (selections.length < 2 || selections.length > 20) throw new Error("A parlay needs 2 to 20 selections.");
  if (new Set(selections.map((s) => s.gameId.toLowerCase())).size !== selections.length) {
    throw new Error(SGP_PRICING_UNAVAILABLE);
  }
  const odds = calculateParlayOdds(selections.map((s) => s.odds));
  return { ...odds, ...calculatePayout(1, odds.decimalOdds), pricingMethod: "independent_games" as const };
}
export function normalizeResult(result: string | null): "pending" | "win" | "loss" | "push" {
  if (result === "won") return "win";
  if (result === "lost") return "loss";
  if (result === "void") return "push";
  return result === "win" || result === "loss" || result === "push" ? result : "pending";
}
export function wagerRecord(result: string | null, stake: number, actualReturn: number | null) {
  const normalized = normalizeResult(result);
  return { result: normalized, units: normalized === "pending" ? 0 : Math.round(((actualReturn ?? stake) - stake) * 100) / 100 };
}
