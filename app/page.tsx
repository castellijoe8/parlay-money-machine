"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Game = {
  id: string;
  away_team: string;
  home_team: string;
  starts_at: string;
  status: string;
  home_score: number | null;
  away_score: number | null;
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

type UserPick = {
  game_id: string;
  pick: string | null;
  bet_type: string | null;
  line: number | null;
  odds: number | null;
};

const SCROLL_KEY = "parlay-money-machine-home-scroll";

export default function HomePage() {
  const [games, setGames] = useState<Game[]>([]);
  const [userPicks, setUserPicks] = useState<Record<string, UserPick>>({});
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    loadGames();
    loadUserPicks();

    const interval = setInterval(async () => {
      try {
        await fetch("/api/sync-scores");
        await loadGames();
      } catch (error) {
        console.error("Score refresh error:", error);
      }
    }, 60 * 1000);

    const handleScroll = () => {
      sessionStorage.setItem(
        SCROLL_KEY,
        String(window.scrollY)
      );
    };

    window.addEventListener("scroll", handleScroll);

    return () => {
      clearInterval(interval);
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  useEffect(() => {
    if (loading || games.length === 0) return;

    const savedScroll = sessionStorage.getItem(SCROLL_KEY);

    if (!savedScroll) return;

    requestAnimationFrame(() => {
      window.scrollTo({
        top: Number(savedScroll),
        behavior: "instant",
      });
    });
  }, [loading, games.length]);

  async function loadGames() {
    setLoading(true);
    setMessage("");

    const { data, error } = await supabase
      .from("games")
      .select(
        "id, away_team, home_team, starts_at, status, home_score, away_score, spread, spread_home, spread_odds_away, spread_odds_home, total, total_odds_over, total_odds_under, moneyline_away, moneyline_home"
      )
      .in("status", ["scheduled", "live"])
      .order("starts_at", { ascending: true });

    if (error) {
      console.error("Games error:", error);
      setMessage(`Database error: ${error.message}`);
      setLoading(false);
      return;
    }

    const now = new Date();

    const visibleGames = (data ?? []).filter((game) => {
      const startTime = new Date(game.starts_at);

      if (game.status === "live") {
        return true;
      }

      return startTime >= now;
    });

    setGames(visibleGames);
    setLoading(false);
  }

  async function loadUserPicks() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return;
    }

    const { data, error } = await supabase
      .from("picks")
      .select("game_id, pick, bet_type, line, odds")
      .eq("user_id", user.id);

    if (error) {
      console.error("User picks error:", error);
      return;
    }

    const pickMap: Record<string, UserPick> = {};

    (data ?? []).forEach((pick) => {
      if (!pick.game_id) return;

      pickMap[pick.game_id] = pick;
    });

    setUserPicks(pickMap);
  }

  function saveScrollPosition() {
    sessionStorage.setItem(
      SCROLL_KEY,
      String(window.scrollY)
    );
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

  function isLive(game: Game) {
    return (
      game.status === "live" ||
      (game.away_score !== null && game.home_score !== null)
    );
  }

  function formatUserPick(pick: UserPick) {
    if (pick.bet_type === "spread") {
      return `${pick.pick ?? "Pick"} ${
        pick.line !== null ? formatLine(pick.line) : ""
      } ${formatOdds(pick.odds)}`.trim();
    }

    if (pick.bet_type === "total") {
      return `${pick.pick ?? "Pick"} ${
        pick.line !== null ? pick.line : ""
      } ${formatOdds(pick.odds)}`.trim();
    }

    if (pick.bet_type === "moneyline") {
      return `${pick.pick ?? "Pick"} ${formatOdds(pick.odds)}`.trim();
    }

    return pick.pick ?? "Wager placed";
  }

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-6 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6">
          <p className="text-gray-600">
            Pick your side and make your 1-unit wager.
          </p>
        </div>

        <section>
          <div className="mb-5">
            <h2 className="text-2xl font-bold text-gray-900">
              Upcoming Games
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              Choose a game to make your wager.
            </p>
          </div>

          {loading ? (
            <div className="rounded-xl bg-white p-6 shadow-sm">
              <p className="text-gray-500">
                Loading upcoming games...
              </p>
            </div>
          ) : message ? (
            <div className="rounded-xl bg-white p-6 shadow-sm">
              <p className="text-gray-500">{message}</p>
            </div>
          ) : games.length === 0 ? (
            <div className="rounded-xl bg-white p-6 shadow-sm">
              <p className="font-semibold text-gray-900">
                No upcoming games
              </p>

              <p className="mt-1 text-sm text-gray-500">
                Check back soon for new games.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {games.map((game) => {
                const live = isLive(game);
                const existingPick = userPicks[game.id];

                return (
                  <div
                    key={game.id}
                    id={`game-${game.id}`}
                    className="rounded-xl bg-white p-4 shadow-sm sm:p-5"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        {live ? (
                          <div className="mb-1.5 inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-red-700">
                            ● Live
                          </div>
                        ) : null}

                        <h3 className="text-lg font-bold leading-tight text-gray-900 sm:text-xl">
                          {game.away_team}{" "}
                          <span className="font-normal text-gray-400">
                            vs.
                          </span>{" "}
                          {game.home_team}
                        </h3>

                        {live ? (
                          <div className="mt-1 text-xl font-bold text-gray-900">
                            {game.away_score ?? 0} —{" "}
                            {game.home_score ?? 0}
                          </div>
                        ) : (
                          <p className="mt-1 text-xs text-gray-500 sm:text-sm">
                            {formatDate(game.starts_at)}
                          </p>
                        )}
                      </div>

                      <button
                        onClick={() => {
                          saveScrollPosition();
                          window.location.href = `/wager/${game.id}`;
                        }}
                        className="w-full shrink-0 rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-gray-700 sm:w-auto"
                      >
                        {existingPick
                          ? "View Wager"
                          : "Place Wager"}
                      </button>
                    </div>

                    {existingPick ? (
                      <div className="mt-3 rounded-lg border border-green-200 bg-green-50 px-3 py-2">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-[10px] font-bold uppercase tracking-wide text-green-700">
                              Your Pick
                            </p>

                            <p className="mt-0.5 truncate text-sm font-bold text-gray-900">
                              {formatUserPick(existingPick)}
                            </p>
                          </div>

                          <span className="shrink-0 text-xs font-semibold text-green-700">
                            1 Unit
                          </span>
                        </div>
                      </div>
                    ) : null}

                    <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
                      <div className="rounded-lg bg-gray-50 px-3 py-2.5">
                        <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">
                          Spread
                        </p>

                        <div className="mt-1.5 space-y-1 text-xs">
                          <div className="flex justify-between gap-2">
                            <span className="truncate">
                              {game.away_team}
                            </span>

                            <span className="shrink-0 font-semibold">
                              {formatLine(game.spread)}{" "}
                              {formatOdds(
                                game.spread_odds_away
                              )}
                            </span>
                          </div>

                          <div className="flex justify-between gap-2">
                            <span className="truncate">
                              {game.home_team}
                            </span>

                            <span className="shrink-0 font-semibold">
                              {formatLine(game.spread_home)}{" "}
                              {formatOdds(
                                game.spread_odds_home
                              )}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-lg bg-gray-50 px-3 py-2.5">
                        <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">
                          Total
                        </p>

                        <div className="mt-1.5 space-y-1 text-xs">
                          <div className="flex justify-between gap-2">
                            <span>Over</span>

                            <span className="font-semibold">
                              {game.total ?? "—"}{" "}
                              {formatOdds(
                                game.total_odds_over
                              )}
                            </span>
                          </div>

                          <div className="flex justify-between gap-2">
                            <span>Under</span>

                            <span className="font-semibold">
                              {game.total ?? "—"}{" "}
                              {formatOdds(
                                game.total_odds_under
                              )}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-lg bg-gray-50 px-3 py-2.5">
                        <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">
                          Moneyline
                        </p>

                        <div className="mt-1.5 space-y-1 text-xs">
                          <div className="flex justify-between gap-2">
                            <span className="truncate">
                              {game.away_team}
                            </span>

                            <span className="shrink-0 font-semibold">
                              {formatOdds(
                                game.moneyline_away
                              )}
                            </span>
                          </div>

                          <div className="flex justify-between gap-2">
                            <span className="truncate">
                              {game.home_team}
                            </span>

                            <span className="shrink-0 font-semibold">
                              {formatOdds(
                                game.moneyline_home
                              )}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <p className="mt-2.5 text-[11px] font-semibold text-gray-500">
                      1 Unit Risked
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}