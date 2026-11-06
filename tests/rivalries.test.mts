import test from "node:test";
import assert from "node:assert/strict";
import { getPacificWeekWindow, isWithinWeeklyWindow } from "../lib/daily-edge-window.ts";
import { rivalryRecord, type RivalPick } from "../lib/rivalries.ts";

test("lock weeks include Monday night and roll over at Tuesday Pacific midnight across DST", () => {
  const week = getPacificWeekWindow(new Date("2026-11-03T07:59:00Z"), 2);
  assert.equal(week.startIso, "2026-10-27T07:00:00.000Z");
  assert.equal(week.endIso, "2026-11-03T08:00:00.000Z");
  assert.equal(isWithinWeeklyWindow("2026-11-03T07:59:59Z", week), true);
  assert.equal(isWithinWeeklyWindow("2026-11-03T08:00:00Z", week), false);
});

test("rivalries count game markets once and distinguish middles and unresolved games", () => {
  const base: RivalPick = { id: "a", user_id: "a", game_id: "g", pick: "Over", bet_type: "Total", line: 40, result: "win", units: 1, game: null };
  const theirs = { ...base, id: "b", user_id: "b", pick: "Under", result: "loss" };
  assert.deepEqual(rivalryRecord([base, theirs, { ...base, id: "c" }], "a", "b"), { wins: 1, losses: 0, other: 0, pending: 0 });
  assert.equal(rivalryRecord([base, { ...theirs, result: "win" }], "a", "b").other, 1);
  assert.equal(rivalryRecord([base, { ...theirs, result: null }], "a", "b").pending, 1);
});
