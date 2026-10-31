export type ParlayOdds = {
  decimalOdds: number;
  americanOdds: number;
};

export function americanToDecimal(odds: number): number {
  if (!Number.isFinite(odds) || odds === 0 || !Number.isInteger(odds)) {
    throw new Error("American odds must be a non-zero integer.");
  }
  return odds > 0 ? 1 + odds / 100 : 1 + 100 / Math.abs(odds);
}

export function decimalToAmerican(decimalOdds: number): number {
  if (!Number.isFinite(decimalOdds) || decimalOdds <= 1) {
    throw new Error("Decimal odds must be greater than 1.");
  }
  const odds = Math.round(decimalOdds >= 2 ? (decimalOdds - 1) * 100 : -100 / (decimalOdds - 1));
  if (!Number.isSafeInteger(odds)) throw new Error("Combined odds exceed the supported precision.");
  return odds;
}

export function calculateParlayOdds(americanOdds: number[]): ParlayOdds {
  if (americanOdds.length < 2) throw new Error("A parlay needs at least two selections.");
  const decimalOdds = americanOdds.reduce((product, odds) => product * americanToDecimal(odds), 1);
  if (!Number.isFinite(decimalOdds)) throw new Error("Combined odds are outside the supported range.");
  return { decimalOdds, americanOdds: decimalToAmerican(decimalOdds) };
}

export function calculatePayout(stake: number, decimalOdds: number) {
  if (!Number.isFinite(stake) || stake <= 0) throw new Error("Stake must be greater than zero.");
  if (!Number.isFinite(decimalOdds) || decimalOdds <= 1) throw new Error("Invalid decimal odds.");
  const totalReturn = Math.round(stake * decimalOdds * 100) / 100;
  if (!Number.isFinite(totalReturn) || totalReturn > Number.MAX_SAFE_INTEGER / 100) throw new Error("Potential return exceeds the supported precision.");
  return { totalReturn, profit: Math.round((totalReturn - stake) * 100) / 100 };
}
