"use client";

import { useEffect, useMemo, useState } from "react";
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
    away_team: string;
    home_team: string;
    starts_at: string;
  } | null;
};

type SortOption =
  | "newest"
  | "oldest"
  | "biggest-win"
  | "biggest-loss";

export default function WagersPage() {
  const [wagers, setWagers] = useState<Wager[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [sortOption, setSortOption] =
    useState<SortOption>("newest");

  useEffect(() => {
    loadWagers();
  }, []);

  async function loadWagers() {
    setLoading(true);
    setMessage("");

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setMessage("Please sign in to view your wagers.");
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("picks")
      .select(`
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
          starts_at
        )
      `)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Picks error:", error);
      setMessage("Unable to load your wagers.");
      setLoading(false);
      return;
    }

    setWagers((data ?? []) as unknown as Wager[]);
    setLoading(false);
  }

  const pendingWagers = wagers.filter(
    (wager) =>
      !wager.result ||
      wager.result.toLowerCase() === "pending"
  );

  const completedWagers = wagers.filter(
    (wager) =>
      wager.result &&
      wager.result.toLowerCase() !== "pending"
  );

  const wins = completedWagers.filter(
    (wager) => wager.result?.toLowerCase() === "win"
  ).length;

  const losses = completedWagers.filter(
    (wager) => wager.result?.toLowerCase() === "loss"
  ).length;

  const pushes = completedWagers.filter(
    (wager) => wager.result?.toLowerCase() === "push"
  ).length;

  const netUnits = completedWagers.reduce(
    (total, wager) =>
      total + Number(wager.units ?? 0),
    0
  );

  const decidedWagers = wins + losses;

  const winRate =
    decidedWagers > 0
      ? Math.round((wins / decidedWagers) * 100)
      : 0;

  const sortedCompletedWagers = useMemo(() => {
    const sorted = [...completedWagers];

    switch (sortOption) {
      case "oldest":
        return sorted.sort(
          (a, b) =>
            new Date(a.created_at).getTime() -
            new Date(b.created_at).getTime()
        );

      case "biggest-win":
        return sorted.sort(
          (a, b) =>
            Number(b.units ?? 0) -
            Number(a.units ?? 0)
        );

      case "biggest-loss":
        return sorted.sort(
          (a, b) =>
            Number(a.units ?? 0) -
            Number(b.units ?? 0)
        );

      case "newest":
      default:
        return sorted.sort(
          (a, b) =>
            new Date(b.created_at).getTime() -
            new Date(a.created_at).getTime()
        );
    }
  }, [completedWagers, sortOption]);

  function formatDate(date: string) {
    return new Date(date).toLocaleString([], {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function gameName(wager: Wager) {
    if (!wager.game) {
      return "Game unavailable";
    }

    return `${wager.game.away_team} vs. ${wager.game.home_team}`;
  }

  function wagerDetails(wager: Wager) {
    const parts: string[] = [];

    if (wager.bet_type) {
      parts.push(wager.bet_type);
    }

    if (
      wager.line !== null &&
      wager.line !== undefined
    ) {
      parts.push(
        wager.line > 0
          ? `+${wager.line}`
          : String(wager.line)
      );
    }

    if (
      wager.odds !== null &&
      wager.odds !== undefined
    ) {
      parts.push(
        wager.odds > 0
          ? `+${wager.odds}`
          : String(wager.odds)
      );
    }

    return parts.join(" ");
  }

  function formatUnits(units: number | null) {
    const value = Number(units ?? 0);

    if (value > 0) {
      return `+${value.toFixed(2)}`;
    }

    return value.toFixed(2);
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

  return (
    <main className="min-h-screen bg-gray-50 px-3 py-5 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-4xl">

        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">
            My Bets
          </h1>

          <p className="mt-1 text-sm text-gray-500">
            Track your wagers, results, and units.
          </p>
        </div>

        {loading ? (
          <div className="mt-8 rounded-2xl bg-white p-6 shadow-sm">
            <p className="text-gray-500">
              Loading your wagers...
            </p>
          </div>
        ) : message ? (
          <div className="mt-8 rounded-2xl bg-white p-6 shadow-sm">
            <p className="text-gray-500">
              {message}
            </p>
          </div>
        ) : (
          <>
            {/* Stats */}
            <div className="mt-5 grid grid-cols-2 gap-2.5 sm:mt-6 sm:grid-cols-4 sm:gap-3">

              {/* Record */}
              <div className="rounded-2xl bg-white p-3.5 shadow-sm sm:p-5">
                <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 sm:text-xs">
                  Record
                </p>

                <p className="mt-1 text-xl font-extrabold text-gray-900 sm:text-2xl">
                  {wins}–{losses}
                  {pushes > 0 && (
                    <span className="text-base text-gray-400 sm:text-lg">
                      {" "}– {pushes}
                    </span>
                  )}
                </p>

                <p className="mt-0.5 text-[10px] text-gray-400 sm:text-xs">
                  {completedWagers.length} completed
                </p>
              </div>

              {/* Win Rate */}
              <div className="rounded-2xl bg-white p-3.5 shadow-sm sm:p-5">
                <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 sm:text-xs">
                  Win Rate
                </p>

                <p className="mt-1 text-xl font-extrabold text-gray-900 sm:text-2xl">
                  {winRate}%
                </p>

                <p className="mt-0.5 text-[10px] text-gray-400 sm:text-xs">
                  {decidedWagers} decided
                </p>
              </div>

              {/* Bets */}
              <div className="rounded-2xl bg-white p-3.5 shadow-sm sm:p-5">
                <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 sm:text-xs">
                  Bets
                </p>

                <p className="mt-1 text-xl font-extrabold text-gray-900 sm:text-2xl">
                  {wagers.length}
                </p>

                <p className="mt-0.5 text-[10px] text-gray-400 sm:text-xs">
                  {pendingWagers.length > 0
                    ? `${pendingWagers.length} pending`
                    : "No pending"}
                </p>
              </div>

              {/* Net Units */}
              <div className="rounded-2xl bg-white p-3.5 shadow-sm sm:p-5">
                <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 sm:text-xs">
                  Net Units
                </p>

                <p
                  className={`mt-1 text-xl font-extrabold sm:text-2xl ${
                    netUnits > 0
                      ? "text-green-600"
                      : netUnits < 0
                      ? "text-red-600"
                      : "text-gray-900"
                  }`}
                >
                  {netUnits > 0 ? "+" : ""}
                  {netUnits.toFixed(2)}
                </p>

                <p className="mt-0.5 text-[10px] text-gray-400 sm:text-xs">
                  Current profit
                </p>
              </div>
            </div>

            {/* Pending */}
            <section className="mt-7 sm:mt-8">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-gray-900">
                  Pending
                </h2>

                {pendingWagers.length > 0 && (
                  <span className="rounded-full bg-yellow-100 px-2.5 py-1 text-xs font-bold text-yellow-800">
                    {pendingWagers.length}
                  </span>
                )}
              </div>

              {pendingWagers.length === 0 ? (
                <div className="mt-3 rounded-2xl border border-dashed border-gray-300 bg-white p-5 text-center">
                  <p className="text-sm text-gray-500">
                    No pending bets.
                  </p>
                </div>
              ) : (
                <div className="mt-3 space-y-2.5">
                  {pendingWagers.map((wager) => (
                    <div
                      key={wager.id}
                      className="overflow-hidden rounded-2xl bg-white shadow-sm"
                    >
                      <div className="border-l-4 border-yellow-400 p-3.5 sm:p-5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h3 className="truncate text-sm font-bold text-gray-900 sm:text-base">
                              {gameName(wager)}
                            </h3>

                            {wager.game && (
                              <p className="mt-1 text-[11px] text-gray-500 sm:text-xs">
                                {formatDate(
                                  wager.game.starts_at
                                )}
                              </p>
                            )}

                            <div className="mt-3">
                              <p className="text-[9px] font-bold uppercase tracking-wide text-gray-400 sm:text-xs">
                                Your Pick
                              </p>

                              <p className="mt-0.5 truncate text-sm font-extrabold text-gray-900 sm:text-base">
                                {wager.pick}
                              </p>

                              {wagerDetails(wager) && (
                                <p className="mt-0.5 text-xs text-gray-500 sm:text-sm">
                                  {wagerDetails(wager)}
                                </p>
                              )}
                            </div>
                          </div>

                          <div className="shrink-0 text-right">
                            <span className="inline-flex rounded-full bg-yellow-100 px-2 py-1 text-[10px] font-bold uppercase text-yellow-800 sm:px-2.5 sm:text-xs">
                              Pending
                            </span>

                            <p className="mt-2 text-sm font-extrabold text-gray-700 sm:mt-3">
                              1.00
                            </p>

                            <p className="text-[9px] font-bold uppercase tracking-wide text-gray-400 sm:text-[11px]">
                              Unit Risk
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Completed */}
            <section className="mt-8 sm:mt-10">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold text-gray-900">
                    Completed
                  </h2>

                  {completedWagers.length > 0 && (
                    <span className="ml-3 text-xs font-medium text-gray-400 sm:hidden">
                      {completedWagers.length} bets
                    </span>
                  )}
                </div>

                {completedWagers.length > 0 && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="hidden text-xs font-medium text-gray-400 sm:block">
                      {completedWagers.length} bets
                    </span>

                    <label className="flex flex-1 items-center justify-end gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-wide text-gray-400 sm:text-xs">
                        Sort
                      </span>

                      <select
                        value={sortOption}
                        onChange={(event) =>
                          setSortOption(
                            event.target.value as SortOption
                          )
                        }
                        className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 outline-none transition focus:border-green-500 focus:ring-1 focus:ring-green-500 sm:px-3 sm:py-2"
                      >
                        <option value="newest">
                          Newest
                        </option>
                        <option value="oldest">
                          Oldest
                        </option>
                        <option value="biggest-win">
                          Biggest Win
                        </option>
                        <option value="biggest-loss">
                          Biggest Loss
                        </option>
                      </select>
                    </label>
                  </div>
                )}
              </div>

              {completedWagers.length === 0 ? (
                <div className="mt-3 rounded-2xl border border-dashed border-gray-300 bg-white p-5 text-center">
                  <p className="text-sm text-gray-500">
                    No completed bets yet.
                  </p>
                </div>
              ) : (
                <div className="mt-3 space-y-2 sm:space-y-2.5">
                  {sortedCompletedWagers.map((wager) => {
                    const result =
                      wager.result?.toLowerCase();

                    const won = result === "win";
                    const pushed = result === "push";

                    return (
                      <div
                        key={wager.id}
                        className={`overflow-hidden rounded-2xl bg-white shadow-sm ${
                          won
                            ? "border-l-4 border-green-500"
                            : pushed
                            ? "border-l-4 border-gray-300"
                            : "border-l-4 border-red-500"
                        }`}
                      >
                        <div className="p-3.5 sm:p-5">
                          <div className="flex items-center justify-between gap-3">

                            {/* Bet information */}
                            <div className="min-w-0 flex-1">
                              <h3 className="truncate text-sm font-bold text-gray-900 sm:text-base">
                                {gameName(wager)}
                              </h3>

                              <p className="mt-1 truncate text-xs text-gray-600 sm:text-sm">
                                <span className="font-bold text-gray-900">
                                  {wager.pick}
                                </span>

                                {wagerDetails(wager) && (
                                  <span className="text-gray-400">
                                    {" "}
                                    · {wagerDetails(wager)}
                                  </span>
                                )}
                              </p>
                            </div>

                            {/* Result */}
                            <div className="shrink-0 text-right">
                              <p
                                className={`text-xl font-extrabold leading-none sm:text-2xl ${
                                  won
                                    ? "text-green-600"
                                    : pushed
                                    ? "text-gray-600"
                                    : "text-red-600"
                                }`}
                              >
                                {formatUnits(wager.units)}
                              </p>

                              <span
                                className={`mt-1.5 inline-flex rounded-full px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wide sm:px-2.5 sm:py-1 sm:text-[11px] ${
                                  won
                                    ? "bg-green-100 text-green-800"
                                    : pushed
                                    ? "bg-gray-100 text-gray-600"
                                    : "bg-red-100 text-red-800"
                                }`}
                              >
                                {wager.result}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Active sort indicator */}
              {completedWagers.length > 1 && (
                <p className="mt-2 text-right text-[10px] text-gray-400">
                  Sorted by {sortLabel().toLowerCase()}
                </p>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}