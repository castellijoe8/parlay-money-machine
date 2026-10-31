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
  return JSON.stringify([s.gameId, s.betType.toLowerCase(), s.pick, s.line]);
}
// Compatibility does not depend on pricing eligibility or other placed wagers.
export function compatibilityError(selections: Selection[]): string | null {
  for (let i = 0; i < selections.length; i++) {
    for (let j = i + 1; j < selections.length; j++) {
      const a = selections[i], b = selections[j];
      if (a.gameId !== b.gameId) continue;
      if (selectionKey(a) === selectionKey(b)) return "That exact selection is already in your parlay.";
      if (a.betType === b.betType) return `Only one ${a.betType.toLowerCase()} selection per game can be combined in a parlay.`;
      if (a.pick === b.pick && [a.betType, b.betType].includes("Spread") && [a.betType, b.betType].includes("Moneyline")) {
        return `${a.pick} spread and ${a.pick} moneyline cannot be combined in the same parlay.`;
      }
    }
  }
  return null;
}
export function priceParlay(selections: Selection[]) {
  const incompatible = compatibilityError(selections);
  if (incompatible) throw new Error(incompatible);
  if (selections.length < 2 || selections.length > 20) throw new Error("A parlay needs 2 to 20 selections.");
  if (new Set(selections.map((s) => s.gameId)).size !== selections.length) {
    throw new Error("Same-game pricing is unavailable for this combination. Our odds feed does not provide a combined SGP quote. Remove a same-game selection or place it as a separate single wager.");
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
