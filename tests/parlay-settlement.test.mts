import test from "node:test";
import assert from "node:assert/strict";
import { settleParlay } from "../lib/parlay-settlement.ts";

const win = { result: "won" as const, decimalOdds: 2 };
const push = { result: "push" as const, decimalOdds: 2 };
const voided = { result: "void" as const, decimalOdds: 2 };

test("all winning legs return stake multiplied by winning legs", () => {
  assert.deepEqual(settleParlay(10, [win, win]), { status: "won", actualReturn: 40, settled: true });
});
test("a losing leg loses the whole parlay, even when another leg is pending", () => {
  assert.deepEqual(settleParlay(10, [{ result: "lost", decimalOdds: 2 }, { result: "pending", decimalOdds: 3 }]), { status: "lost", actualReturn: 0, settled: true });
});
test("a push removes that leg from the odds multiplication", () => {
  assert.deepEqual(settleParlay(10, [win, push]), { status: "won", actualReturn: 20, settled: true });
});
test("multiple pushes preserve the stake; all-push parlays are refunded", () => {
  assert.deepEqual(settleParlay(10, [win, push, push]), { status: "won", actualReturn: 20, settled: true });
  assert.deepEqual(settleParlay(10, [push, push]), { status: "push", actualReturn: 10, settled: true });
});
test("void legs are removed and all-void parlays are marked void", () => {
  assert.deepEqual(settleParlay(10, [win, voided]), { status: "won", actualReturn: 20, settled: true });
  assert.deepEqual(settleParlay(10, [voided, voided]), { status: "void", actualReturn: 10, settled: true });
});
test("postponed, missing, and mixed pending outcomes stay unresolved", () => {
  assert.deepEqual(settleParlay(10, [win, { result: "pending", decimalOdds: 2 }]), { status: "pending", actualReturn: null, settled: false });
});
test("rounds only final total return to cents", () => {
  assert.deepEqual(settleParlay(1, [{ result: "won", decimalOdds: 1.909090909 }, push]), { status: "won", actualReturn: 1.91, settled: true });
});
