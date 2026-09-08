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
  const [updatingId, setUpdatingId] = useState<string | null>(null);

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

  async function settleWager(
    wagerId: string,
    result: "win" | "loss"
  ) {
    setUpdatingId(wagerId);
    setMessage("");

    const { error } = await supabase
      .from("picks")
      .update({ result })
      .eq("id", wagerId);

    if (error) {
      console.error("Settlement error:", error);
      setMessage("Unable to update wager.");
      setUpdatingId(null);
      return;
    }

    setWagers((currentWagers) =>
      currentWagers.map((wager) =>
        wager.id === wagerId
          ? { ...wager, result }
          : wager
      )
    );

    setUpdatingId(null);
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

  const netUnits = completedWagers.reduce(
    (total, wager) => {
      const result = wager.result?.toLowerCase();

      if (result === "win") {
        return total + 1;
      }

      if (result === "loss") {
        return total - 1;
      }

      return total;
    },
    0
  );

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
        wager.line > 0
          ? `+${wager.line}`
          : String(wager.line)
      );
    }

    if (wager.odds !== null && wager.odds !== undefined) {
      parts.push(
        wager.odds > 0
          ? `+${wager.odds}`
          : String(wager.odds)
      );
    }

    return parts.join(" • ");
  }

  return (
    <main className="min-h-screen bg-gray-50 px-6 py-8">
      <div className="mx-auto max-w-4xl">
        <h1 className="text-3xl font-bold text-gray-900">
          My Wagers
        </h1>

        <p className="mt-1 text-gray-500">
          Track your wagers and record.
        </p>

        {loading ? (
          <div className="mt-8 rounded-xl bg-white p-6 shadow-sm">
            <p className="text-gray-500">
              Loading your wagers...
            </p>
          </div>
        ) : message ? (
          <div className="mt-8 rounded-xl bg-white p-6 shadow-sm">
            <p className="text-gray-500">{message}</p>
          </div>
        ) : (
          <>
            <div className="mt-6 grid grid-cols-3 gap-4">
              <div className="rounded-xl bg-white p-5 shadow-sm">
                <p className="text-sm text-gray-500">
                  Record
                </p>

                <p className="mt-1 text-2xl font-bold">
                  {wins}–{losses}
                </p>
              </div>

              <div className="rounded-xl bg-white p-5 shadow-sm">
                <p className="text-sm text-gray-500">
                  Wagers
                </p>

                <p className="mt-1 text-2xl font-bold">
                  {wagers.length}
                </p>
              </div>

              <div className="rounded-xl bg-white p-5 shadow-sm">
                <p className="text-sm text-gray-500">
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

            <section className="mt-8">
              <h2 className="text-xl font-bold text-gray-900">
                Pending Wagers
              </h2>

              {pendingWagers.length === 0 ? (
                <div className="mt-3 rounded-xl bg-white p-5 shadow-sm">
                  <p className="text-gray-500">
                    No pending wagers.
                  </p>
                </div>
              ) : (
                <div className="mt-3 space-y-3">
                  {pendingWagers.map((wager) => (
                    <div
                      key={wager.id}
                      className="rounded-xl bg-white p-5 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h3 className="font-semibold text-gray-900">
                            {gameName(wager)}
                          </h3>

                          {wager.game && (
                            <p className="mt-1 text-sm text-gray-500">
                              {formatDate(
                                wager.game.starts_at
                              )}
                            </p>
                          )}

                          <p className="mt-3 text-sm text-gray-700">
                            Pick:{" "}
                            <span className="font-semibold">
                              {wager.pick}
                            </span>
                          </p>

                          {wagerDetails(wager) && (
                            <p className="mt-1 text-sm text-gray-500">
                              {wagerDetails(wager)}
                            </p>
                          )}

                          <p className="mt-3 font-semibold text-gray-900">
                            1 Unit Risked
                          </p>
                        </div>

                        <div className="text-right">
                          <span className="inline-block rounded-full bg-yellow-100 px-3 py-1 text-xs font-medium text-yellow-800">
                            Pending
                          </span>

                          <div className="mt-4 flex gap-2">
                            <button
                              onClick={() =>
                                settleWager(wager.id, "win")
                              }
                              disabled={
                                updatingId === wager.id
                              }
                              className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {updatingId === wager.id
                                ? "..."
                                : "Win"}
                            </button>

                            <button
                              onClick={() =>
                                settleWager(wager.id, "loss")
                              }
                              disabled={
                                updatingId === wager.id
                              }
                              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {updatingId === wager.id
                                ? "..."
                                : "Loss"}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="mt-10">
              <h2 className="text-xl font-bold text-gray-900">
                Completed Wagers
              </h2>

              {completedWagers.length === 0 ? (
                <div className="mt-3 rounded-xl bg-white p-5 shadow-sm">
                  <p className="text-gray-500">
                    No completed wagers yet.
                  </p>
                </div>
              ) : (
                <div className="mt-3 space-y-3">
                  {completedWagers.map((wager) => {
                    const result =
                      wager.result?.toLowerCase();

                    const won = result === "win";

                    return (
                      <div
                        key={wager.id}
                        className="rounded-xl bg-white p-5 shadow-sm"
                      >
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <h3 className="font-semibold text-gray-900">
                              {gameName(wager)}
                            </h3>

                            <p className="mt-1 text-sm text-gray-500">
                              Pick: {wager.pick}
                            </p>

                            {wagerDetails(wager) && (
                              <p className="mt-1 text-sm text-gray-500">
                                {wagerDetails(wager)}
                              </p>
                            )}
                          </div>

                          <div className="text-right">
                            <p className="font-bold">
                              {won ? "+1.00 Units" : "-1.00 Units"}
                            </p>

                            <span
                              className={`mt-2 inline-block rounded-full px-3 py-1 text-xs font-medium ${
                                won
                                  ? "bg-green-100 text-green-800"
                                  : "bg-red-100 text-red-800"
                              }`}
                            >
                              {wager.result}
                            </span>
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