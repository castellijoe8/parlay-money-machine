"use client";

import { useEffect, useState } from "react";
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

export default function WagersPage() {
  const [wagers, setWagers] = useState<Wager[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

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
    (wager) => !wager.result || wager.result === "pending"
  );

  const completedWagers = wagers.filter(
    (wager) => wager.result && wager.result !== "pending"
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
    (total, wager) => total + Number(wager.units ?? 0),
    0
  );

  const decidedWagers = wins + losses;
  const winRate =
    decidedWagers > 0 ? Math.round((wins / decidedWagers) * 100) : 0;

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

    if (wager.line !== null && wager.line !== undefined) {
      parts.push(
        wager.line > 0 ? `+${wager.line}` : String(wager.line)
      );
    }

    if (wager.odds !== null && wager.odds !== undefined) {
      parts.push(
        wager.odds > 0 ? `+${wager.odds}` : String(wager.odds)
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

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-6 sm:px-6 sm:py-8">
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
            <p className="text-gray-500">Loading your wagers...</p>
          </div>
        ) : message ? (
          <div className="mt-8 rounded-2xl bg-white p-6 shadow-sm">
            <p className="text-gray-500">{message}</p>
          </div>
        ) : (
          <>
            {/* Summary */}
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-2xl bg-white p-4 shadow-sm sm:p-5">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                  Record
                </p>

                <p className="mt-1 text-2xl font-bold text-gray-900">
                  {wins}–{losses}
                  {pushes > 0 && (
                    <span className="text-lg text-gray-400">
                      {" "}
                      – {pushes}
                    </span>
                  )}
                </p>
              </div>

              <div className="rounded-2xl bg-white p-4 shadow-sm sm:p-5">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                  Win Rate
                </p>

                <p className="mt-1 text-2xl font-bold text-gray-900">
                  {winRate}%
                </p>
              </div>

              <div className="rounded-2xl bg-white p-4 shadow-sm sm:p-5">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                  Bets
                </p>

                <p className="mt-1 text-2xl font-bold text-gray-900">
                  {wagers.length}
                </p>

                {pendingWagers.length > 0 && (
                  <p className="mt-1 text-xs text-gray-400">
                    {pendingWagers.length} pending
                  </p>
                )}
              </div>

              <div className="rounded-2xl bg-white p-4 shadow-sm sm:p-5">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                  Net Units
                </p>

                <p
                  className={`mt-1 text-2xl font-bold ${
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
              </div>
            </div>

            {/* Pending */}
            <section className="mt-8">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-gray-900">
                  Pending
                </h2>

                {pendingWagers.length > 0 && (
                  <span className="rounded-full bg-yellow-100 px-2.5 py-1 text-xs font-semibold text-yellow-800">
                    {pendingWagers.length}
                  </span>
                )}
              </div>

              {pendingWagers.length === 0 ? (
                <div className="mt-3 rounded-2xl border border-dashed border-gray-300 bg-white p-6 text-center">
                  <p className="text-sm text-gray-500">
                    No pending bets.
                  </p>
                </div>
              ) : (
                <div className="mt-3 space-y-3">
                  {pendingWagers.map((wager) => (
                    <div
                      key={wager.id}
                      className="overflow-hidden rounded-2xl bg-white shadow-sm"
                    >
                      <div className="border-l-4 border-yellow-400 p-4 sm:p-5">
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <h3 className="truncate font-bold text-gray-900">
                              {gameName(wager)}
                            </h3>

                            {wager.game && (
                              <p className="mt-1 text-xs text-gray-500">
                                {formatDate(wager.game.starts_at)}
                              </p>
                            )}

                            <div className="mt-4">
                              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                                Your Pick
                              </p>

                              <p className="mt-0.5 text-base font-bold text-gray-900">
                                {wager.pick}
                              </p>

                              {wagerDetails(wager) && (
                                <p className="mt-0.5 text-sm text-gray-500">
                                  {wagerDetails(wager)}
                                </p>
                              )}
                            </div>
                          </div>

                          <div className="shrink-0 text-right">
                            <span className="inline-flex rounded-full bg-yellow-100 px-2.5 py-1 text-xs font-semibold text-yellow-800">
                              Pending
                            </span>

                            <p className="mt-3 text-sm font-semibold text-gray-700">
                              1.00
                            </p>

                            <p className="text-[11px] uppercase tracking-wide text-gray-400">
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
            <section className="mt-10">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-gray-900">
                  Completed
                </h2>

                {completedWagers.length > 0 && (
                  <span className="text-xs font-medium text-gray-400">
                    {completedWagers.length} bets
                  </span>
                )}
              </div>

              {completedWagers.length === 0 ? (
                <div className="mt-3 rounded-2xl border border-dashed border-gray-300 bg-white p-6 text-center">
                  <p className="text-sm text-gray-500">
                    No completed bets yet.
                  </p>
                </div>
              ) : (
                <div className="mt-3 space-y-2">
                  {completedWagers.map((wager) => {
                    const result = wager.result?.toLowerCase();
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
                        <div className="p-4 sm:p-5">
                          <div className="flex items-center justify-between gap-4">
                            <div className="min-w-0">
                              <h3 className="truncate font-bold text-gray-900">
                                {gameName(wager)}
                              </h3>

                              <p className="mt-1 text-sm text-gray-600">
                                <span className="font-medium">
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

                            <div className="shrink-0 text-right">
                              <p
                                className={`text-lg font-bold ${
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
                                className={`mt-1 inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold uppercase ${
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
            </section>
          </>
        )}
      </div>
    </main>
  );
}