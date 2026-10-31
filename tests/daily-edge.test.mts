import assert from "node:assert/strict";
import test from "node:test";
import { atsRecord, buildWeeklyNuggets, historicalLine, indexOddsSnapshots, teamForm, totalsRecord, type FinalGame, type OddsSnapshot } from "../lib/daily-edge.ts";
import { getCurrentCollegeSeasonStart, getPacificWeekWindow, isWithinWeeklyWindow } from "../lib/daily-edge-window.ts";
import { isDailyEdgeRefreshAuthorized } from "../lib/daily-edge-refresh.ts";

function finalGame(id: string, startsAt: string, awayScore: number, homeScore: number, overrides: Partial<FinalGame> = {}): FinalGame {
  return { id, sport: "nfl", away_team: "Team A", home_team: "Team B", starts_at: startsAt, status: "final", away_score: awayScore, home_score: homeScore, ...overrides };
}

function odds(game: FinalGame, market: "spreads" | "totals", point: number, observedAt = new Date(Date.parse(game.starts_at) - 3_600_000).toISOString(), id = 1): OddsSnapshot {
  return {
    id,
    game_id: game.id,
    sport: "nfl",
    sportsbook: "draftkings",
    market,
    observed_at: observedAt,
    provider_updated_at: observedAt,
    outcomes: market === "spreads"
      ? [{ name: game.away_team, point: -point }, { name: game.home_team, point }]
      : [{ name: "Over", point }, { name: "Under", point }],
  };
}

test("Pacific reporting window has inclusive Monday start and exclusive next Monday end", () => {
  const window = getPacificWeekWindow(new Date("2026-11-04T20:00:00.000Z"));
  assert.equal(window.startIso, "2026-11-02T08:00:00.000Z");
  assert.equal(window.endIso, "2026-11-09T08:00:00.000Z");
  assert.equal(isWithinWeeklyWindow(window.start, window), true);
  assert.equal(isWithinWeeklyWindow(window.end, window), false);
});

test("Pacific weekly boundaries account for spring and fall daylight-saving transitions", () => {
  const spring = getPacificWeekWindow(new Date("2026-03-08T12:00:00.000Z"));
  const fall = getPacificWeekWindow(new Date("2026-11-01T12:00:00.000Z"));
  assert.equal((spring.end.getTime() - spring.start.getTime()) / 3_600_000, 167);
  assert.equal((fall.end.getTime() - fall.start.getTime()) / 3_600_000, 169);
});

test("college trend history starts with the current FBS season and retains January postseason", () => {
  assert.equal(getCurrentCollegeSeasonStart(new Date("2026-10-30T12:00:00.000Z")), "2026-08-01T00:00:00.000Z");
  assert.equal(getCurrentCollegeSeasonStart(new Date("2027-01-10T12:00:00.000Z")), "2026-08-01T00:00:00.000Z");
  assert.equal(getCurrentCollegeSeasonStart(new Date("2027-07-10T12:00:00.000Z")), "2026-08-01T00:00:00.000Z");
});

test("ATS uses the correct team spread, latest pregame snapshot, and counts pushes", () => {
  const cover = finalGame("cover", "2026-10-20T19:00:00.000Z", 24, 20);
  const push = finalGame("push", "2026-10-13T19:00:00.000Z", 23, 20);
  const coverLines = [odds(cover, "spreads", 3.5), odds(cover, "spreads", 4.5, "2026-10-20T18:30:00.000Z", 2)];
  const lines = indexOddsSnapshots([...coverLines, odds(push, "spreads", 3)]);
  assert.equal(historicalLine(cover, "spreads", lines, cover.away_team), -4.5);
  const record = atsRecord([cover, push], "Team A", "nfl", lines, 8);
  assert.deepEqual({ covers: record.covers, misses: record.misses, pushes: record.pushes, sampleSize: record.sampleSize }, { covers: 0, misses: 1, pushes: 1, sampleSize: 2 });
});

test("games without historical spreads are excluded from ATS records", () => {
  const lined = finalGame("lined", "2026-10-20T19:00:00.000Z", 21, 17);
  const missing = finalGame("missing", "2026-10-13T19:00:00.000Z", 30, 10);
  const record = atsRecord([lined, missing], "Team A", "nfl", indexOddsSnapshots([odds(lined, "spreads", 3.5)]));
  assert.equal(record.sampleSize, 1);
  assert.equal(record.covers, 1);
});

test("totals use captured historical totals and handle pushes", () => {
  const over = finalGame("over", "2026-10-20T19:00:00.000Z", 24, 23);
  const push = finalGame("total-push", "2026-10-13T19:00:00.000Z", 21, 21);
  const record = totalsRecord([over, push], "Team A", "nfl", indexOddsSnapshots([odds(over, "totals", 45), odds(push, "totals", 42)]));
  assert.deepEqual({ overs: record.covers, unders: record.misses, pushes: record.pushes, sampleSize: record.sampleSize }, { overs: 1, unders: 0, pushes: 1, sampleSize: 2 });
});

test("team form returns the latest requested completed games and averages", () => {
  const games = Array.from({ length: 10 }, (_, index) => finalGame(`g${index}`, new Date(Date.UTC(2026, 9, 20 - index * 7)).toISOString(), 20 + index, 17));
  const form = teamForm(games, "Team A", "nfl", 5);
  assert.equal(form.games.length, 5);
  assert.equal(form.wins, 5);
  assert.equal(form.pointsFor, 22);
  assert.equal(form.pointsAgainst, 17);
});

test("line movement compares captured earliest and latest values and excludes started games", () => {
  const future: FinalGame = { id: "upcoming", sport: "nfl", away_team: "Team A", home_team: "Team B", starts_at: new Date(Date.now() + 86_400_000).toISOString(), status: "scheduled", away_score: null, home_score: null };
  const start = new Date(Date.now() - 86_400_000).toISOString();
  const latest = new Date(Date.now() - 3_600_000).toISOString();
  const snapshots: OddsSnapshot[] = [
    { id: 10, game_id: future.id, sport: "nfl", sportsbook: "draftkings", market: "totals", observed_at: start, provider_updated_at: start, outcomes: [{ name: "Over", point: 44 }, { name: "Under", point: 44 }], is_earliest: true },
    { id: 11, game_id: future.id, sport: "nfl", sportsbook: "draftkings", market: "totals", observed_at: latest, provider_updated_at: latest, outcomes: [{ name: "Over", point: 46 }, { name: "Under", point: 46 }] },
  ];
  const insights = buildWeeklyNuggets([future], [], snapshots);
  assert.equal(insights.some((item) => item.category === "LINE MOVEMENT" && item.detail.includes("+44 → latest recorded +46")), true);
  const started = { ...future, status: "live", starts_at: new Date(Date.now() - 1_000).toISOString() };
  assert.deepEqual(buildWeeklyNuggets([started], [], snapshots), []);
});

test("scheduled and canceled games are not betting candidates", () => {
  const canceled: FinalGame = { id: "cancel", sport: "nfl", away_team: "Team A", home_team: "Team B", starts_at: new Date(Date.now() + 86_400_000).toISOString(), status: "canceled", away_score: null, home_score: null };
  assert.deepEqual(buildWeeklyNuggets([canceled], [], []), []);
});

test("manual refresh requires the configured bearer secret", () => {
  assert.equal(isDailyEdgeRefreshAuthorized(null, "secret"), false);
  assert.equal(isDailyEdgeRefreshAuthorized("Bearer wrong", "secret"), false);
  assert.equal(isDailyEdgeRefreshAuthorized("Bearer secret", "secret"), true);
  assert.equal(isDailyEdgeRefreshAuthorized("Bearer secret", undefined), false);
});
