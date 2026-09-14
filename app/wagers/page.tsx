"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Wager = {
  id: string;
  user_id: string;
  pick: string;
  bet_type: string | null;
  line: number | null;
  odds: number | null;
  result: string | null;
  units: number | null;
  created_at: string;
  game: {
    away_team: string | null;
    home_team: string | null;
    starts_at: string | null;
    sport: "ncaaf" | "nfl" | null;
  } | null;
};

type ResultFilter = "all" | "pending" | "wins" | "losses" | "pushes";
type TimeFilter = "all" | "week" | "month" | "season";
type BetTypeFilter = "all" | "spread" | "moneyline" | "total";
type SortOption = "newest" | "oldest" | "biggest-win" | "biggest-loss";
type SportFilter = "all" | "ncaaf" | "nfl";

export default function WagersPage() {
  const [wagers, setWagers] = useState<Wager[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const [resultFilter, setResultFilter] = useState<ResultFilter>("all");
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");
  const [betTypeFilter, setBetTypeFilter] =
    useState<BetTypeFilter>("all");
  const [sortOption, setSortOption] = useState<SortOption>("newest");
  const [sportFilter, setSportFilter] = useState<SportFilter>("all");

  async function loadWagers() {
    setLoading(true);
    setMessage("");

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setMessage("Please log in to view your bets.");
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("picks")
      .select(
        `
        id,
        user_id,
        pick,
        bet_type,
        line,
        odds,
        result,
        units,
        created_at,
        game:games (
          away_team,
          home_team,
          starts_at,
          sport
        )
      `
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error loading wagers:", error);
      setMessage("Unable to load your bets.");
      setLoading(false);
      return;
    }

    setWagers((data as unknown as Wager[]) || []);
    setLoading(false);
  }

  useEffect(() => {
    // This effect intentionally loads the user's wagers from Supabase on mount.
    // The async operation updates local state as the external data arrives.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadWagers();
  }, []);

  const pending = useMemo(
    () =>
      wagers.filter(
        (wager) =>
          !wager.result ||
          wager.result.toLowerCase() === "pending"
      ),
    [wagers]
  );

  const completed = useMemo(
    () =>
      wagers.filter(
        (wager) =>
          wager.result &&
          wager.result.toLowerCase() !== "pending"
      ),
    [wagers]
  );

  const wins = useMemo(
    () =>
      completed.filter(
        (wager) => wager.result?.toLowerCase() === "win"
      ),
    [completed]
  );

  const losses = useMemo(
    () =>
      completed.filter(
        (wager) => wager.result?.toLowerCase() === "loss"
      ),
    [completed]
  );

  const pushes = useMemo(
    () =>
      completed.filter(
        (wager) => wager.result?.toLowerCase() === "push"
      ),
    [completed]
  );

  const netUnits = useMemo(
    () =>
      completed.reduce(
        (sum, wager) => sum + (wager.units ?? 0),
        0
      ),
    [completed]
  );

  const decisions = wins.length + losses.length;
  const winRate = decisions > 0 ? (wins.length / decisions) * 100 : 0;

  const currentStreak = useMemo(() => {
    const sorted = [...completed].sort(
      (a, b) =>
        new Date(b.created_at).getTime() -
        new Date(a.created_at).getTime()
    );

    if (sorted.length === 0) {
      return {
        type: null as "win" | "loss" | "push" | null,
        count: 0,
      };
    }

    const firstResult = sorted[0].result?.toLowerCase();

    if (
      firstResult !== "win" &&
      firstResult !== "loss" &&
      firstResult !== "push"
    ) {
      return {
        type: null as "win" | "loss" | "push" | null,
        count: 0,
      };
    }

    let count = 0;

    for (const wager of sorted) {
      const result = wager.result?.toLowerCase();

      if (result === firstResult) {
        count++;
      } else {
        break;
      }
    }

    return {
      type: firstResult,
      count,
    };
  }, [completed]);

  function getStartOfWeek() {
    const now = new Date();
    const day = now.getDay();
    const diff = day === 0 ? -6 : 1 - day;

    const start = new Date(now);
    start.setDate(now.getDate() + diff);
    start.setHours(0, 0, 0, 0);

    return start;
  }

  function getStartOfMonth() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }

  function getStartOfSeason() {
    const now = new Date();

    // For the app's current sports season, use the current calendar year.
    return new Date(now.getFullYear(), 0, 1);
  }

  const matchesTimeFilter = useCallback((wager: Wager) => {
    if (timeFilter === "all") return true;

    const wagerDate = new Date(wager.created_at);

    if (timeFilter === "week") {
      return wagerDate >= getStartOfWeek();
    }

    if (timeFilter === "month") {
      return wagerDate >= getStartOfMonth();
    }

    if (timeFilter === "season") {
      return wagerDate >= getStartOfSeason();
    }

    return true;
  }, [timeFilter]);

  function normalizeBetType(type: string | null) {
    if (!type) return "";

    const normalized = type.toLowerCase();

    if (
      normalized.includes("spread") ||
      normalized === "ats"
    ) {
      return "spread";
    }

    if (
      normalized.includes("moneyline") ||
      normalized === "ml"
    ) {
      return "moneyline";
    }

    if (
      normalized.includes("total") ||
      normalized === "over" ||
      normalized === "under"
    ) {
      return "total";
    }

    return normalized;
  }

  const matchesBetTypeFilter = useCallback((wager: Wager) => {
    if (betTypeFilter === "all") return true;

    return normalizeBetType(wager.bet_type) === betTypeFilter;
  }, [betTypeFilter]);

  const matchesResultFilter = useCallback(
    (wager: Wager) => {
      const result = wager.result?.toLowerCase();

      if (resultFilter === "all") return true;

      if (resultFilter === "pending") {
        return !result || result === "pending";
      }

      if (resultFilter === "wins") return result === "win";
      if (resultFilter === "losses") return result === "loss";
      if (resultFilter === "pushes") return result === "push";

      return true;
    },
    [resultFilter]
  );

  const matchesSportFilter = useCallback(
    (wager: Wager) => {
      return sportFilter === "all" || wager.game?.sport === sportFilter;
    },
    [sportFilter]
  );
  const filteredWagers = useMemo(() => {
    return wagers.filter(
      (wager) =>
        matchesTimeFilter(wager) &&
        matchesBetTypeFilter(wager) &&
        matchesResultFilter(wager) &&
        matchesSportFilter(wager)
    );
  }, [
    wagers,
    matchesTimeFilter,
    matchesBetTypeFilter,
    matchesResultFilter,
    matchesSportFilter,
  ]);

  const filteredPending = useMemo(
    () =>
      filteredWagers.filter(
        (wager) =>
          !wager.result ||
          wager.result.toLowerCase() === "pending"
      ),
    [filteredWagers]
  );

  const filteredCompleted = useMemo(
    () =>
      filteredWagers.filter(
        (wager) =>
          wager.result &&
          wager.result.toLowerCase() !== "pending"
      ),
    [filteredWagers]
  );

  const sortedCompletedWagers = useMemo(() => {
    const sorted = [...filteredCompleted];

    switch (sortOption) {
      case "oldest":
        return sorted.sort(
          (a, b) =>
            new Date(a.created_at).getTime() -
            new Date(b.created_at).getTime()
        );

      case "biggest-win":
        return sorted.sort(
          (a, b) => (b.units ?? 0) - (a.units ?? 0)
        );

      case "biggest-loss":
        return sorted.sort(
          (a, b) => (a.units ?? 0) - (b.units ?? 0)
        );

      case "newest":
      default:
        return sorted.sort(
          (a, b) =>
            new Date(b.created_at).getTime() -
            new Date(a.created_at).getTime()
        );
    }
  }, [filteredCompleted, sortOption]);

  function formatDate(dateString: string | null) {
    if (!dateString) return "Date unavailable";

    const date = new Date(dateString);

    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  function formatGameDate(dateString: string | null) {
    if (!dateString) return "";

    const date = new Date(dateString);

    return date.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function gameName(wager: Wager) {
    const away = wager.game?.away_team;
    const home = wager.game?.home_team;

    if (away && home) {
      return `${away} vs ${home}`;
    }

    return "Game";
  }

  function wagerDetails(wager: Wager) {
    const parts: string[] = [];

    if (wager.bet_type) {
      parts.push(wager.bet_type);
    }

    if (wager.line !== null && wager.line !== undefined) {
      parts.push(
        `${wager.line > 0 ? "+" : ""}${wager.line}`
      );
    }

    if (wager.odds !== null && wager.odds !== undefined) {
      parts.push(
        `${wager.odds > 0 ? "+" : ""}${wager.odds}`
      );
    }

    return parts.join(" • ");
  }

  function formatUnits(units: number | null) {
    if (units === null || units === undefined) return "0.00u";

    const sign = units > 0 ? "+" : "";

    return `${sign}${units.toFixed(2)}u`;
  }

  function resultLabel(result: string | null) {
    if (!result || result.toLowerCase() === "pending") {
      return "PENDING";
    }

    return result.toUpperCase();
  }

  function resultClass(result: string | null) {
    const normalized = result?.toLowerCase();

    if (normalized === "win") {
      return "border-l-4 border-l-green-500";
    }

    if (normalized === "loss") {
      return "border-l-4 border-l-red-500";
    }

    if (normalized === "push") {
      return "border-l-4 border-l-gray-400";
    }

    return "border-l-4 border-l-yellow-400";
  }

  function resultBadgeClass(result: string | null) {
    const normalized = result?.toLowerCase();

    if (normalized === "win") {
      return "bg-green-100 text-green-700";
    }

    if (normalized === "loss") {
      return "bg-red-100 text-red-700";
    }

    if (normalized === "push") {
      return "bg-gray-100 text-gray-700";
    }

    return "bg-yellow-100 text-yellow-800";
  }

  function streakDisplay() {
    if (!currentStreak.type || currentStreak.count === 0) {
      return {
        label: "—",
        detail: "No completed bets",
        className: "text-gray-500",
      };
    }

    if (currentStreak.type === "win") {
      return {
        label: `🔥 ${currentStreak.count}W`,
        detail:
          currentStreak.count === 1
            ? "Current streak"
            : "Winning streak",
        className: "text-green-600",
      };
    }

    if (currentStreak.type === "loss") {
      return {
        label: `❄️ ${currentStreak.count}L`,
        detail:
          currentStreak.count === 1
            ? "Current streak"
            : "Losing streak",
        className: "text-red-600",
      };
    }

    return {
      label: `${currentStreak.count}P`,
      detail: "Push streak",
      className: "text-gray-600",
    };
  }

  function sortLabel() {
    switch (sortOption) {
      case "oldest":
        return "Oldest";
      case "biggest-win":
        return "Biggest Win";
      case "biggest-loss":
        return "Biggest Loss";
      case "newest":
      default:
        return "Newest";
    }
  }

  const streak = streakDisplay();

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-black tracking-tight">
          My Bets
        </h1>

        <p className="mt-1 text-sm text-gray-500">
          Your complete betting history and performance.
        </p>
      </div>

      {message && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {message}
        </div>
      )}

      {/* Performance Summary */}
      <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            Record
          </div>
          <div className="mt-2 text-2xl font-black">
            {wins.length}-{losses.length}-{pushes.length}
          </div>
          <div className="mt-1 text-xs text-gray-400">
            W-L-P
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            Win Rate
          </div>
          <div className="mt-2 text-2xl font-black">
            {winRate.toFixed(0)}%
          </div>
          <div className="mt-1 text-xs text-gray-400">
            Decided bets
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            Pending
          </div>
          <div className="mt-2 text-2xl font-black">
            {pending.length}
          </div>
          <div className="mt-1 text-xs text-gray-400">
            Awaiting kickoff
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            Net Units
          </div>
          <div
            className={`mt-2 text-2xl font-black ${
              netUnits > 0
                ? "text-green-600"
                : netUnits < 0
                ? "text-red-600"
                : "text-gray-900"
            }`}
          >
            {formatUnits(netUnits)}
          </div>
          <div className="mt-1 text-xs text-gray-400">
            Overall profit
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            Streak
          </div>
          <div
            className={`mt-2 text-2xl font-black ${streak.className}`}
          >
            {streak.label}
          </div>
          <div className="mt-1 text-xs text-gray-400">
            {streak.detail}
          </div>
        </div>
      </section>

      {/* Filters */}
      <section className="mb-6 rounded-2xl border bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500">
            Filter Bets
          </h2>

          {(resultFilter !== "all" ||
            timeFilter !== "all" ||
            betTypeFilter !== "all" ||
            sportFilter !== "all") && (
            <button
              onClick={() => {
                setResultFilter("all");
                setTimeFilter("all");
                setBetTypeFilter("all");
                setSportFilter("all");
              }}
              className="text-xs font-semibold text-green-600 hover:text-green-700"
            >
              Clear filters
            </button>
          )}
        </div>

        <div className="mb-4">
          <div className="mb-2 text-xs font-semibold text-gray-400">
            SPORT
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {[
              ["all", "All"],
              ["nfl", "NFL"],
              ["ncaaf", "NCAAF"],
            ].map(([value, label]) => (
              <button
                key={value}
                onClick={() =>
                  setSportFilter(value as SportFilter)
                }
                className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-bold transition ${
                  sportFilter === value
                    ? "bg-green-600 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Result Filter */}
        <div className="mb-4">
          <div className="mb-2 text-xs font-semibold text-gray-400">
            RESULT
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1">
            {[
              ["all", "All"],
              ["pending", "Pending"],
              ["wins", "Wins"],
              ["losses", "Losses"],
              ["pushes", "Pushes"],
            ].map(([value, label]) => (
              <button
                key={value}
                onClick={() =>
                  setResultFilter(value as ResultFilter)
                }
                className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-bold transition ${
                  resultFilter === value
                    ? "bg-gray-900 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Time Filter */}
        <div className="mb-4">
          <div className="mb-2 text-xs font-semibold text-gray-400">
            TIME
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1">
            {[
              ["all", "All Time"],
              ["week", "This Week"],
              ["month", "This Month"],
              ["season", "This Season"],
            ].map(([value, label]) => (
              <button
                key={value}
                onClick={() =>
                  setTimeFilter(value as TimeFilter)
                }
                className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-bold transition ${
                  timeFilter === value
                    ? "bg-gray-900 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Bet Type Filter */}
        <div>
          <div className="mb-2 text-xs font-semibold text-gray-400">
            BET TYPE
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1">
            {[
              ["all", "All Types"],
              ["spread", "Spread"],
              ["moneyline", "Moneyline"],
              ["total", "Total"],
            ].map(([value, label]) => (
              <button
                key={value}
                onClick={() =>
                  setBetTypeFilter(value as BetTypeFilter)
                }
                className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-bold transition ${
                  betTypeFilter === value
                    ? "bg-gray-900 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {loading ? (
        <div className="rounded-2xl border bg-white p-10 text-center text-sm text-gray-500 shadow-sm">
          Loading your bets...
        </div>
      ) : wagers.length === 0 ? (
        <div className="rounded-2xl border bg-white p-10 text-center shadow-sm">
          <div className="text-lg font-bold">
            No bets yet
          </div>
          <p className="mt-1 text-sm text-gray-500">
            Your wagers will appear here once you make one. Make your first pick on the game board.
          </p>
          <Link
            href="/"
            className="mt-4 inline-block rounded-lg bg-green-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-green-700"
          >
            Browse games
          </Link>
        </div>
      ) : (
        <>
          {/* Pending Bets */}
          {filteredPending.length > 0 && (
            <section className="mb-8">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-black">
                    Pending
                  </h2>

                  <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-bold text-yellow-800">
                    {filteredPending.length}
                  </span>
                </div>
              </div>

              <div className="space-y-3">
                {filteredPending.map((wager) => (
                  <div
                    key={wager.id}
                    className={`rounded-2xl border bg-white p-4 shadow-sm ${resultClass(
                      wager.result
                    )}`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="text-base font-black">
                          {wager.pick}
                        </div>

                        <div className="mt-1 text-sm font-semibold text-gray-700">
                          {gameName(wager)}
                        </div>

                        {wager.game?.sport && (
                          <span className="mt-2 inline-block rounded bg-gray-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-gray-500">
                            {wager.game.sport}
                          </span>
                        )}

                        <div className="mt-1 text-xs text-gray-400">
                          {wager.game?.starts_at
                            ? formatGameDate(
                                wager.game.starts_at
                              )
                            : formatDate(wager.created_at)}
                        </div>

                        {wagerDetails(wager) && (
                          <div className="mt-2 text-xs font-medium text-gray-500">
                            {wagerDetails(wager)}
                          </div>
                        )}
                      </div>

                      <div className="flex shrink-0 flex-col items-end gap-2">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-black ${resultBadgeClass(
                            wager.result
                          )}`}
                        >
                          PENDING
                        </span>

                        <span className="text-xs font-semibold text-gray-400">
                          Risk: 1.00u
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Completed Bets */}
          <section>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black">
                  Completed
                </h2>

                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-bold text-gray-600">
                  {filteredCompleted.length}
                </span>
              </div>

              <select
                value={sortOption}
                onChange={(event) =>
                  setSortOption(
                    event.target.value as SortOption
                  )
                }
                className="rounded-lg border bg-white px-3 py-2 text-xs font-semibold text-gray-700 outline-none"
              >
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
                <option value="biggest-win">
                  Biggest Win
                </option>
                <option value="biggest-loss">
                  Biggest Loss
                </option>
              </select>
            </div>

            {filteredCompleted.length === 0 ? (
              <div className="rounded-2xl border bg-white p-8 text-center shadow-sm">
                <div className="text-sm font-semibold text-gray-600">
                  No bets match these filters.
                </div>

                <button
                  onClick={() => {
                    setResultFilter("all");
                    setTimeFilter("all");
                    setBetTypeFilter("all");
                  }}
                  className="mt-2 text-sm font-bold text-green-600 hover:text-green-700"
                >
                  Clear filters
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {sortedCompletedWagers.map((wager) => {
                  const normalizedResult =
                    wager.result?.toLowerCase();

                  const isWin = normalizedResult === "win";
                  const isLoss = normalizedResult === "loss";
                  const isPush = normalizedResult === "push";

                  return (
                    <div
                      key={wager.id}
                      className={`rounded-2xl border bg-white p-4 shadow-sm ${resultClass(
                        wager.result
                      )}`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="text-base font-black">
                            {wager.pick}
                          </div>

                          <div className="mt-1 text-sm font-semibold text-gray-700">
                            {gameName(wager)}
                          </div>

                          {wager.game?.sport && (
                            <span className="mt-2 inline-block rounded bg-gray-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-gray-500">
                              {wager.game.sport}
                            </span>
                          )}

                          <div className="mt-1 text-xs text-gray-400">
                            {formatDate(wager.created_at)}
                          </div>

                          {wagerDetails(wager) && (
                            <div className="mt-2 text-xs font-medium text-gray-500">
                              {wagerDetails(wager)}
                            </div>
                          )}
                        </div>

                        <div className="flex shrink-0 flex-col items-end gap-2">
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-black ${resultBadgeClass(
                              wager.result
                            )}`}
                          >
                            {resultLabel(wager.result)}
                          </span>

                          <div
                            className={`text-lg font-black ${
                              isWin
                                ? "text-green-600"
                                : isLoss
                                ? "text-red-600"
                                : isPush
                                ? "text-gray-500"
                                : "text-gray-900"
                            }`}
                          >
                            {formatUnits(wager.units)}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Active Sort Indicator */}
          {filteredCompleted.length > 1 && (
            <div className="mt-4 text-center text-xs text-gray-400">
              Sorted by {sortLabel()}
            </div>
          )}
        </>
      )}
    </main>
  );
}
