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
  result: string | null;
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
        await loadUserPicks();
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
      .select(
        "game_id, pick, bet_type, line, odds, result"
      )
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

  function getPickStatus(pick: UserPick) {
    const result = String(pick.result ?? "")
      .trim()
      .toLowerCase();

    if (result === "win") {
      return {
        label: "WIN",
        className:
          "border-green-200 bg-green-50 text-green-700",
      };
    }

    if (result === "loss") {
      return {
        label: "LOSS",
        className:
          "border-red-200 bg-red-50 text-red-700",
      };
    }

    if (result === "push") {
      return {
        label: "PUSH",
        className:
          "border-yellow-200 bg-yellow-50 text-yellow-700",
      };
    }

    return {
      label: "PENDING",
      className:
        "border-gray-200 bg-gray-50 text-gray-600",
    };
  }

  function getDayKey(date: string) {
    const gameDate = new Date(date);

    return `${gameDate.getFullYear()}-${String(
      gameDate.getMonth() + 1
    ).padStart(2, "0")}-${String(
      gameDate.getDate()
    ).padStart(2, "0")}`;
  }

  function formatDayHeader(date: string) {
    const gameDate = new Date(date);

    const today = new Date();

    const tomorrow = new Date();
    tomorrow.setDate(today.getDate() + 1);

    const isSameDay = (a: Date, b: Date) =>
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate();

    if (isSameDay(gameDate, today)) {
      return "Today";
    }

    if (isSameDay(gameDate, tomorrow)) {
      return "Tomorrow";
    }

    return gameDate.toLocaleDateString([], {
      weekday: "long",
      month: "short",
      day: "numeric",
    });
  }

  const liveGames = games
    .filter((game) => isLive(game))
    .sort(
      (a, b) =>
        new Date(a.starts_at).getTime() -
        new Date(b.starts_at).getTime()
    );

  const upcomingGames = games
    .filter((game) => !isLive(game))
    .sort(
      (a, b) =>
        new Date(a.starts_at).getTime() -
        new Date(b.starts_at).getTime()
    );

  const groupedUpcoming = upcomingGames.reduce(
    (groups, game) => {
      const key = getDayKey(game.starts_at);

      if (!groups[key]) {
        groups[key] = [];
      }

      groups[key].push(game);

      return groups;
    },
    {} as Record<string, Game[]>
  );

  function renderGameCard(game: Game) {
    const live = isLive(game);
    const existingPick = userPicks[game.id];
    const pickStatus = existingPick
      ? getPickStatus(existingPick)
      : null;

    return (
      <div
        key={game.id}
        id={`game-${game.id}`}
        className={`rounded-xl bg-white p-4 shadow-sm sm:p-5 ${
          live ? "ring-1 ring-red-200" : ""
        }`}
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
            {existingPick ? "View Wager" : "Place Wager"}
          </button>
        </div>

        {existingPick ? (
          <div
            className={`mt-3 rounded-lg border px-3 py-2 ${pickStatus?.className}`}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-[10px] font-bold uppercase tracking-wide">
                    Your Pick
                  </p>

                  <span className="text-[10px] font-bold uppercase tracking-wide">
                    ·
                  </span>

                  <span className="text-[10px] font-bold uppercase tracking-wide">
                    {pickStatus?.label}
                  </span>
                </div>

                <p className="mt-0.5 truncate text-sm font-bold text-gray-900">
                  {formatUserPick(existingPick)}
                </p>
              </div>

              <span className="shrink-0 text-xs font-semibold">
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
                  {formatOdds(game.spread_odds_away)}
                </span>
              </div>

              <div className="flex justify-between gap-2">
                <span className="truncate">
                  {game.home_team}
                </span>

                <span className="shrink-0 font-semibold">
                  {formatLine(game.spread_home)}{" "}
                  {formatOdds(game.spread_odds_home)}
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
                  {formatOdds(game.total_odds_over)}
                </span>
              </div>

              <div className="flex justify-between gap-2">
                <span>Under</span>

                <span className="font-semibold">
                  {game.total ?? "—"}{" "}
                  {formatOdds(game.total_odds_under)}
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
                  {formatOdds(game.moneyline_away)}
                </span>
              </div>

              <div className="flex justify-between gap-2">
                <span className="truncate">
                  {game.home_team}
                </span>

                <span className="shrink-0 font-semibold">
                  {formatOdds(game.moneyline_home)}
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
            <div>
              {liveGames.length > 0 ? (
                <section className="mb-7">
                  <div className="sticky top-0 z-10 -mx-1 mb-3 border-b border-red-100 bg-gray-50/95 px-1 py-2 backdrop-blur">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-red-500" />
                      <h3 className="text-sm font-bold uppercase tracking-wide text-red-700">
                        Live Now
                      </h3>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {liveGames.map(renderGameCard)}
                  </div>
                </section>
              ) : null}

              {Object.entries(groupedUpcoming).map(
                ([dayKey, dayGames]) => (
                  <section key={dayKey} className="mb-7">
                    <div className="sticky top-0 z-10 -mx-1 mb-3 border-b border-gray-200 bg-gray-50/95 px-1 py-2 backdrop-blur">
                      <h3 className="text-sm font-bold uppercase tracking-wide text-gray-700">
                        {formatDayHeader(
                          dayGames[0].starts_at
                        )}
                      </h3>
                    </div>

                    <div className="space-y-3">
                      {dayGames.map(renderGameCard)}
                    </div>
                  </section>
                )
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}