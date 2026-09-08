"use client";

import { useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";

type Game = {
  id: string;
  away_team: string;
  home_team: string;
  starts_at: string;
  spread: number | null;
  spread_home: number | null;
  spread_odds_away: number | null;
  spread_odds_home: number | null;
  total: number | null;
  total_odds_over: number | null;
  total_odds_under: number | null;
  moneyline_away: number | null;
  moneyline_home: number | null;
};

export default function HomePage() {
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    loadGames();
  }, []);

  async function loadGames() {
    setLoading(true);
    setMessage("");

    const { data, error } = await supabase
      .from("games")
      .select(
        "id, away_team, home_team, starts_at, spread, spread_home, spread_odds_away, spread_odds_home, total, total_odds_over, total_odds_under, moneyline_away, moneyline_home"
      )
      .gte("starts_at", new Date().toISOString())
      .order("starts_at", { ascending: true });

    if (error) {
      console.error("Games error:", error);
      setMessage("Unable to load upcoming games.");
      setLoading(false);
      return;
    }

    setGames(data ?? []);
    setLoading(false);
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

  function formatOdds(odds: number | null) {
    if (odds === null) {
      return "—";
    }

    return odds > 0 ? `+${odds}` : String(odds);
  }

  function formatLine(line: number | null) {
    if (line === null) {
      return "—";
    }

    return line > 0 ? `+${line}` : String(line);
  }

  return (
    <main className="min-h-screen bg-gray-50 px-6 py-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">
            Parlay Money Machine
          </h1>

          <p className="mt-2 text-gray-600">
            Pick your side and make your 1-unit wager.
          </p>
        </div>

        <section>
          <h2 className="text-2xl font-bold text-gray-900">
            Upcoming Games
          </h2>

          <p className="mt-1 text-gray-500">
            Choose a game to make your wager.
          </p>

          {loading ? (
            <div className="mt-6 rounded-xl bg-white p-6 shadow-sm">
              <p className="text-gray-500">
                Loading upcoming games...
              </p>
            </div>
          ) : message ? (
            <div className="mt-6 rounded-xl bg-white p-6 shadow-sm">
              <p className="text-gray-500">{message}</p>
            </div>
          ) : games.length === 0 ? (
            <div className="mt-6 rounded-xl bg-white p-6 shadow-sm">
              <p className="font-semibold text-gray-900">
                No upcoming games
              </p>
              <p className="mt-1 text-sm text-gray-500">
                Check back soon for new games.
              </p>
            </div>
          ) : (
            <div className="mt-6 space-y-4">
              {games.map((game) => (
                <div
                  key={game.id}
                  className="rounded-xl bg-white p-6 shadow-sm"
                >
                  <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
                    <div>
                      <h3 className="text-xl font-bold text-gray-900">
                        {game.away_team} vs. {game.home_team}
                      </h3>

                      <p className="mt-1 text-sm text-gray-500">
                        {formatDate(game.starts_at)}
                      </p>
                    </div>

                    <button
                      onClick={() =>
                        (window.location.href = `/wager/${game.id}`)
                      }
                      className="rounded-lg bg-gray-900 px-5 py-3 font-semibold text-white hover:bg-gray-700"
                    >
                      Place Wager
                    </button>
                  </div>

                  <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="rounded-lg bg-gray-50 p-4">
                      <p className="text-xs font-semibold uppercase text-gray-500">
                        Spread
                      </p>

                      <div className="mt-2 space-y-1 text-sm">
                        <div className="flex justify-between">
                          <span>{game.away_team}</span>
                          <span className="font-semibold">
                            {formatLine(game.spread)}{" "}
                            {formatOdds(game.spread_odds_away)}
                          </span>
                        </div>

                        <div className="flex justify-between">
                          <span>{game.home_team}</span>
                          <span className="font-semibold">
                            {formatLine(game.spread_home)}{" "}
                            {formatOdds(game.spread_odds_home)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-lg bg-gray-50 p-4">
                      <p className="text-xs font-semibold uppercase text-gray-500">
                        Total
                      </p>

                      <div className="mt-2 space-y-1 text-sm">
                        <div className="flex justify-between">
                          <span>Over</span>
                          <span className="font-semibold">
                            {game.total ?? "—"}{" "}
                            {formatOdds(game.total_odds_over)}
                          </span>
                        </div>

                        <div className="flex justify-between">
                          <span>Under</span>
                          <span className="font-semibold">
                            {game.total ?? "—"}{" "}
                            {formatOdds(game.total_odds_under)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-lg bg-gray-50 p-4">
                      <p className="text-xs font-semibold uppercase text-gray-500">
                        Moneyline
                      </p>

                      <div className="mt-2 space-y-1 text-sm">
                        <div className="flex justify-between">
                          <span>{game.away_team}</span>
                          <span className="font-semibold">
                            {formatOdds(game.moneyline_away)}
                          </span>
                        </div>

                        <div className="flex justify-between">
                          <span>{game.home_team}</span>
                          <span className="font-semibold">
                            {formatOdds(game.moneyline_home)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <p className="mt-4 text-sm font-semibold text-gray-700">
                    1 Unit Risked
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
