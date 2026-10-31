import test from "node:test";
import assert from "node:assert/strict";
import { americanToDecimal, calculateParlayOdds, calculatePayout, decimalToAmerican } from "../lib/parlay-odds.ts";

test("American prices convert using standard formulas", () => {
  assert.equal(americanToDecimal(150), 2.5);
  assert.equal(americanToDecimal(-110), 1 + 100 / 110);
  assert.equal(americanToDecimal(100), 2);
});

test("combined odds preserve full precision through multiplication", () => {
  assert.equal(calculateParlayOdds([150, 150]).decimalOdds, 6.25);
  assert.equal(calculateParlayOdds([-110, -110]).americanOdds, 264);
  // The stated example in the brief mis-multiplies: 2.5 × (1 + 100/110)^2 = 9.11157, or +811.
  assert.equal(calculateParlayOdds([150, -110, -110]).americanOdds, 811);
  assert.equal(calculateParlayOdds([110, -105, 200, -120]).decimalOdds,
    2.1 * (1 + 100 / 105) * 3 * (1 + 100 / 120));
});

test("payout rounds only the final currency values", () => {
  assert.deepEqual(calculatePayout(10, 2.5), { totalReturn: 25, profit: 15 });
  assert.deepEqual(calculatePayout(100, 1 + 100 / 110), { totalReturn: 190.91, profit: 90.91 });
  assert.deepEqual(calculatePayout(0.01, 1.5), { totalReturn: 0.02, profit: 0.01 });
});

test("invalid and zero prices are rejected", () => {
  for (const odds of [0, NaN, Infinity, 1.5]) assert.throws(() => americanToDecimal(odds));
  assert.throws(() => decimalToAmerican(1));
  assert.throws(() => calculateParlayOdds([110]));
});

test("very large American odds remain valid when the result is representable", () => {
  assert.equal(americanToDecimal(100000), 1001);
  assert.equal(americanToDecimal(-100000), 1.001);
});
