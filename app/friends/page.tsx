"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type FriendWager = {
  id: string;
  user_id: string;
  user_name: string | null;
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
    status?: string | null;
    away_score?: number | null;
    home_score?: number | null;
  } | null;
};

type Filter = "all" | "pending" | "live" | "final";

export default function FriendsWagersPage() {
  const [wagers, setWagers] = useState<FriendWager[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    async function loadWagers() {
      setLoading(true);
      setMessage("");

      const { data, error } = await supabase
        .from("picks")
        .select(`
          id,
          user_id,
          user_name,
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
            status,
            away_score,
            home_score
          )
        `)
        .order("created_at", { ascending: false });

      if (error) {
        console.error(error);
        setMessage("Unable to load friends' wagers.");
        setLoading(false);
        return;
      }

      const picks = (data ?? []) as unknown as FriendWager[];

      const userIds = [
        ...new Set(picks.map((wager) => wager.user_id)),
      ];

      let profileMap: Record<string, string> = {};

      if (userIds.length > 0) {
        const { data: profiles, error: profileError } =
          await supabase
            .from("profiles")
            .select("id, display_name")
            .in("id", userIds);

        if (profileError) {
          console.error("Profiles error:", profileError);
        } else {
          profileMap = Object.fromEntries(
            (profiles ?? [])
              .filter((profile) => profile.display_name)
              .map((profile) => [
                profile.id,
                profile.display_name,
              ])
          );
        }
      }

      const wagersWithNames = picks.map((wager) => ({
        ...wager,
        user_name:
          profileMap[wager.user_id] ||
          wager.user_name ||
          "Player",
      }));

      setWagers(wagersWithNames);
      setLoading(false);
    }

    loadWagers();
  }, []);

  function gameStatus(
    wager: FriendWager
  ): "pending" | "live" | "final" {
    const status = wager.game?.status?.toLowerCase();

    if (status === "final") {
      return "final";
    }

    if (status === "live") {
      return "live";
    }

    return "pending";
  }

  function formatDate(date: string) {
    return new Date(date).toLocaleString([], {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function formatLine(line: number | null) {
    if (line === null) return "";

    return line > 0 ? `+${line}` : String(line);
  }

  function formatOdds(odds: number | null) {
    if (odds === null) return "";

    return odds > 0 ? `+${odds}` : String(odds);
  }

  function resultLabel(wager: FriendWager) {
    const result = wager.result?.toLowerCase();

    if (result === "win") {
      return wager.units !== null
        ? `+${wager.units.toFixed(2)}`
        : "Win";
    }

    if (result === "loss") {
      return wager.units !== null
        ? wager.units.toFixed(2)
        : "Loss";
    }

    if (result === "push") {
      return "0.00";
    }

    return "Pending";
  }

  function resultStyle(wager: FriendWager) {
    const result = wager.result?.toLowerCase();

    if (result === "win") {
      return "text-green-700";
    }

    if (result === "loss") {
      return "text-red-600";
    }

    if (result === "push") {
      return "text-gray-600";
    }

    return "text-yellow-600";
  }

  const filteredWagers = useMemo(() => {
    if (filter === "all") {
      return wagers;
    }

    return wagers.filter(
      (wager) => gameStatus(wager) === filter
    );
  }, [wagers, filter]);

  const groupedGames = useMemo(() => {
    const groups = new Map<string, FriendWager[]>();

    filteredWagers.forEach((wager) => {
      const gameKey = wager.game
        ? `${wager.game.away_team}-${wager.game.home_team}-${wager.game.starts_at}`
        : wager.id;

      if (!groups.has(gameKey)) {
        groups.set(gameKey, []);
      }

      groups.get(gameKey)!.push(wager);
    });

    return Array.from(groups.values());
  }, [filteredWagers]);

  const counts = useMemo(() => {
    return {
      all: wagers.length,
      pending: wagers.filter(
        (wager) => gameStatus(wager) === "pending"
      ).length,
      live: wagers.filter(
        (wager) => gameStatus(wager) === "live"
      ).length,
      final: wagers.filter(
        (wager) => gameStatus(wager) === "final"
      ).length,
    };
  }, [wagers]);

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-6 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-5xl">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            Friends' Bets
          </h1>

          <p className="mt-1 text-gray-500">
            See what everyone is riding.
          </p>
        </div>

        {loading ? (
          <div className="mt-6 rounded-xl bg-white p-6 shadow-sm">
            <p className="text-gray-500">
              Loading friends' bets...
            </p>
          </div>
        ) : message ? (
          <div className="mt-6 rounded-xl bg-white p-6 shadow-sm">
            <p className="text-gray-500">{message}</p>
          </div>
        ) : wagers.length === 0 ? (
          <div className="mt-6 rounded-xl bg-white p-6 shadow-sm">
            <p className="text-gray-500">
              No wagers have been submitted yet.
            </p>
          </div>
        ) : (
          <>
            <div className="mt-6 flex flex-wrap gap-2">
              {(
                [
                  ["all", "All"],
                  ["live", "Live"],
                  ["pending", "Pending"],
                  ["final", "Final"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => setFilter(value)}
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                    filter === value
                      ? "bg-gray-900 text-white"
                      : "bg-white text-gray-600 shadow-sm hover:bg-gray-100"
                  }`}
                >
                  {label}{" "}
                  <span className="ml-1 opacity-60">
                    {counts[value]}
                  </span>
                </button>
              ))}
            </div>

            <div className="mt-5 space-y-5">
              {groupedGames.map((gameWagers) => {
                const game = gameWagers[0].game;
                const status = gameStatus(gameWagers[0]);

                return (
                  <div
                    key={`${game?.away_team}-${game?.home_team}-${game?.starts_at}`}
                    className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm"
                  >
                    <div className="border-b border-gray-200 bg-gray-50 px-4 py-3 sm:px-5">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <h2 className="truncate text-base font-bold text-gray-900 sm:text-lg">
                            {game
                              ? `${game.away_team} vs. ${game.home_team}`
                              : "Unknown Game"}
                          </h2>

                          {game &&
                          status === "final" &&
                          game.away_score !== null &&
                          game.home_score !== null ? (
                            <p className="mt-0.5 text-sm font-semibold text-gray-600">
                              {game.away_score}–{game.home_score} · Final
                            </p>
                          ) : game ? (
                            <p className="mt-0.5 text-sm text-gray-500">
                              {formatDate(game.starts_at)}
                            </p>
                          ) : null}
                        </div>

                        <span
                          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${
                            status === "live"
                              ? "bg-red-100 text-red-700"
                              : status === "final"
                              ? "bg-gray-200 text-gray-700"
                              : "bg-yellow-100 text-yellow-700"
                          }`}
                        >
                          {status === "live"
                            ? "LIVE"
                            : status === "final"
                            ? "FINAL"
                            : "PENDING"}
                        </span>
                      </div>
                    </div>

                    <div className="hidden overflow-x-auto sm:block">
                      <table className="w-full text-left">
                        <thead>
                          <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400">
                            <th className="px-5 py-3 font-semibold">
                              Friend
                            </th>
                            <th className="px-3 py-3 font-semibold">
                              Pick
                            </th>
                            <th className="px-3 py-3 font-semibold">
                              Line
                            </th>
                            <th className="px-3 py-3 font-semibold">
                              Odds
                            </th>
                            <th className="px-3 py-3 font-semibold">
                              Risk
                            </th>
                            <th className="px-5 py-3 text-right font-semibold">
                              Result
                            </th>
                          </tr>
                        </thead>

                        <tbody>
                          {gameWagers.map((wager) => (
                            <tr
                              key={wager.id}
                              className="border-b border-gray-100 last:border-0"
                            >
                              <td className="px-5 py-4 font-semibold text-gray-900">
                                {wager.user_name}
                              </td>

                              <td className="px-3 py-4">
                                <div className="font-semibold text-gray-900">
                                  {wager.pick}
                                </div>

                                {wager.bet_type && (
                                  <div className="text-xs text-gray-400">
                                    {wager.bet_type}
                                  </div>
                                )}
                              </td>

                              <td className="px-3 py-4 text-gray-600">
                                {formatLine(wager.line) || "—"}
                              </td>

                              <td className="px-3 py-4 text-gray-600">
                                {formatOdds(wager.odds) || "—"}
                              </td>

                              <td className="px-3 py-4 text-gray-600">
                                1.00
                              </td>

                              <td
                                className={`px-5 py-4 text-right font-bold ${resultStyle(
                                  wager
                                )}`}
                              >
                                {resultLabel(wager)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="sm:hidden">
                      {gameWagers.map((wager) => (
                        <div
                          key={wager.id}
                          className="border-b border-gray-100 px-4 py-4 last:border-0"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="font-bold text-gray-900">
                                {wager.user_name}
                              </p>

                              <p className="mt-0.5 truncate text-sm font-semibold text-gray-700">
                                {wager.pick}
                              </p>
                            </div>

                            <p
                              className={`shrink-0 font-bold ${resultStyle(
                                wager
                              )}`}
                            >
                              {resultLabel(wager)}
                            </p>
                          </div>

                          <div className="mt-2 flex gap-4 text-xs text-gray-500">
                            <span>
                              {wager.bet_type || "Bet"}
                            </span>

                            <span>
                              {formatLine(wager.line) || "—"}
                            </span>

                            <span>
                              {formatOdds(wager.odds) || "—"}
                            </span>

                            <span>1.00 unit</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {filteredWagers.length === 0 && (
              <div className="mt-6 rounded-xl bg-white p-6 text-center shadow-sm">
                <p className="text-gray-500">
                  No bets match this filter.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}