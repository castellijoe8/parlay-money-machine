export type ParlayLegResult = "pending" | "won" | "lost" | "push" | "void";

export function settleParlay(
  stake: number,
  legs: Array<{ result: ParlayLegResult; decimalOdds: number }>,
) {
  if (!Number.isFinite(stake) || stake <= 0 || legs.length < 2) throw new Error("Invalid parlay.");
  if (legs.some((leg) => !Number.isFinite(leg.decimalOdds) || leg.decimalOdds <= 1)) throw new Error("Invalid leg odds.");
  if (legs.some((leg) => leg.result === "lost")) return { status: "lost" as const, actualReturn: 0, settled: true };
  if (legs.some((leg) => leg.result === "pending")) return { status: "pending" as const, actualReturn: null, settled: false };

  const winners = legs.filter((leg) => leg.result === "won");
  if (winners.length === 0) {
    const allVoid = legs.every((leg) => leg.result === "void");
    return { status: allVoid ? "void" as const : "push" as const, actualReturn: Math.round(stake * 100) / 100, settled: true };
  }
  const totalReturn = Math.round(stake * winners.reduce((odds, leg) => odds * leg.decimalOdds, 1) * 100) / 100;
  return { status: "won" as const, actualReturn: totalReturn, settled: true };
}
