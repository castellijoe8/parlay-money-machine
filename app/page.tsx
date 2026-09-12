"use client";

import { useEffect, useMemo, useState } from "react";
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

type ViewFilter = "all" | "live" | "upcoming";

const SCROLL_KEY = "parlay-money-machine-home-scroll";

export default function HomePage() {
  const [games, setGames] = useState<Game[]>([]);
  const [userPicks, setUserPicks] = useState<Record<string, UserPick>>({});
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [viewFilter, setViewFilter] =
    useState<ViewFilter>("all");

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

  function formatShortDate(date: string) {
    return new Date(date).toLocaleString([], {
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

  const filteredLiveGames = useMemo(() => {
    if (viewFilter === "upcoming") {
      return [];
    }

    return liveGames;
  }, [liveGames, viewFilter]);

  const filteredUpcomingGames = useMemo(() => {
    if (viewFilter === "live") {
      return [];
    }

    return upcomingGames;
  }, [upcomingGames, viewFilter]);

  const groupedUpcoming = filteredUpcomingGames.reduce(
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

  const pendingPickCount = Object.values(userPicks).filter(
    (pick) => {
      const result = String(pick.result ?? "")
        .trim()
        .toLowerCase();

      return !result || result === "pending";
    }
  ).length;

  const gamesWithPicks = games.filter(
    (game) => userPicks[game.id]
  ).length;

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
        className={`overflow-hidden rounded-2xl bg-white shadow-sm ${
          live
            ? "border border-red-200 ring-1 ring-red-100"
            : "border border-gray-100"
        }`}
      >
        {/* Game Header */}
        <div className="p-3.5 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              {live ? (
                <div className="mb-1.5 inline-flex items-center gap-1.5 rounded-full bg-red-100 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-red-700 sm:text-xs">
                  <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                  Live Now
                </div>
              ) : (
                <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-gray-400 sm:text-xs">
                  {formatShortDate(game.starts_at)}
                </p>
              )}

              <h3 className="truncate text-base font-extrabold leading-tight text-gray-900 sm:text-xl">
                {game.away_team}{" "}
                <span className="font-normal text-gray-400">
                  vs.
                </span>{" "}
                {game.home_team}
              </h3>
            </div>

            {live ? (
              <div className="shrink-0 text-right">
                <p className="text-xl font-extrabold leading-none text-gray-900 sm:text-2xl">
                  {game.away_score ?? 0} —{" "}
                  {game.home_score ?? 0}
                </p>
                <p className="mt-1 text-[9px] font-bold uppercase tracking-wide text-red-500">
                  Live
                </p>
              </div>
            ) : null}
          </div>

          {/* Existing Pick */}
          {existingPick ? (
            <div
              className={`mt-3 rounded-xl border px-3 py-2.5 ${pickStatus?.className}`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-[9px] font-extrabold uppercase tracking-wide sm:text-[10px]">
                      Your Pick
                    </p>

                    <span className="text-[9px] font-bold opacity-50 sm:text-[10px]">
                      ·
                    </span>

                    <span className="text-[9px] font-extrabold uppercase tracking-wide sm:text-[10px]">
                      {pickStatus?.label}
                    </span>
                  </div>

                  <p className="mt-0.5 truncate text-sm font-extrabold text-gray-900 sm:text-base">
                    {formatUserPick(existingPick)}
                  </p>
                </div>

                <button
                  onClick={() => {
                    saveScrollPosition();
                    window.location.href = `/wager/${game.id}`;
                  }}
                  className="shrink-0 rounded-lg bg-gray-900 px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-white transition hover:bg-gray-700 sm:px-3.5 sm:text-xs"
                >
                  View Bet
                </button>
              </div>
            </div>
          ) : null}

          {/* Betting Markets */}
          <div className="mt-3 grid grid-cols-3 gap-1.5 sm:mt-4 sm:gap-2">
            {/* Spread */}
            <div className="rounded-xl bg-gray-50 p-2.5 sm:p-3">
              <p className="text-[9px] font-extrabold uppercase tracking-wide text-gray-400 sm:text-[10px]">
                Spread
              </p>

              <div className="mt-2 space-y-1.5">
                <div className="flex items-center justify-between gap-1">
                  <span className="truncate text-[10px] font-medium text-gray-600 sm:text-xs">
                    {game.away_team}
                  </span>

                  <span className="shrink-0 text-[10px] font-bold text-gray-900 sm:text-xs">
                    {formatLine(game.spread)}{" "}
                    <span className="font-medium text-gray-500">
                      {formatOdds(game.spread_odds_away)}
                    </span>
                  </span>
                </div>

                <div className="flex items-center justify-between gap-1">
                  <span className="truncate text-[10px] font-medium text-gray-600 sm:text-xs">
                    {game.home_team}
                  </span>

                  <span className="shrink-0 text-[10px] font-bold text-gray-900 sm:text-xs">
                    {formatLine(game.spread_home)}{" "}
                    <span className="font-medium text-gray-500">
                      {formatOdds(game.spread_odds_home)}
                    </span>
                  </span>
                </div>
              </div>
            </div>

            {/* Total */}
            <div className="rounded-xl bg-gray-50 p-2.5 sm:p-3">
              <p className="text-[9px] font-extrabold uppercase tracking-wide text-gray-400 sm:text-[10px]">
                Total
              </p>

              <div className="mt-2 space-y-1.5">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[10px] font-medium text-gray-600 sm:text-xs">
                    Over
                  </span>

                  <span className="shrink-0 text-[10px] font-bold text-gray-900 sm:text-xs">
                    {game.total ?? "—"}{" "}
                    <span className="font-medium text-gray-500">
                      {formatOdds(game.total_odds_over)}
                    </span>
                  </span>
                </div>

                <div className="flex items-center justify-between gap-1">
                  <span className="text-[10px] font-medium text-gray-600 sm:text-xs">
                    Under
                  </span>

                  <span className="shrink-0 text-[10px] font-bold text-gray-900 sm:text-xs">
                    {game.total ?? "—"}{" "}
                    <span className="font-medium text-gray-500">
                      {formatOdds(game.total_odds_under)}
                    </span>
                  </span>
                </div>
              </div>
            </div>

            {/* Moneyline */}
            <div className="rounded-xl bg-gray-50 p-2.5 sm:p-3">
              <p className="text-[9px] font-extrabold uppercase tracking-wide text-gray-400 sm:text-[10px]">
                Moneyline
              </p>

              <div className="mt-2 space-y-1.5">
                <div className="flex items-center justify-between gap-1">
                  <span className="truncate text-[10px] font-medium text-gray-600 sm:text-xs">
                    {game.away_team}
                  </span>

                  <span className="shrink-0 text-[10px] font-bold text-gray-900 sm:text-xs">
                    {formatOdds(game.moneyline_away)}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-1">
                  <span className="truncate text-[10px] font-medium text-gray-600 sm:text-xs">
                    {game.home_team}
                  </span>

                  <span className="shrink-0 text-[10px] font-bold text-gray-900 sm:text-xs">
                    {formatOdds(game.moneyline_home)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Main CTA */}
          {!existingPick ? (
            <button
              onClick={() => {
                saveScrollPosition();
                window.location.href = `/wager/${game.id}`;
              }}
              className="mt-3 w-full rounded-xl bg-gray-900 px-4 py-3 text-sm font-extrabold text-white transition hover:bg-gray-700 active:scale-[0.99] sm:mt-4"
            >
              Bet This Game →
            </button>
          ) : (
            <div className="mt-2 flex items-center justify-between px-1 text-[10px] font-semibold text-gray-400 sm:text-xs">
              <span>1 Unit Risked</span>
              <span>{formatDate(game.starts_at)}</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  const filterButtonClass = (filter: ViewFilter) =>
    `rounded-lg px-3 py-1.5 text-xs font-bold transition sm:px-4 sm:py-2 ${
      viewFilter === filter
        ? "bg-gray-900 text-white shadow-sm"
        : "text-gray-500 hover:bg-gray-100 hover:text-gray-900"
    }`;

  return (
    <main className="min-h-screen bg-gray-50 px-3 py-4 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-5xl">

        {/* Hero */}
        <section className="rounded-2xl bg-white p-4 shadow-sm sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-green-600 sm:text-xs">
                Parlay Money Machine
              </p>

              <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-gray-900 sm:text-3xl">
                Make your pick.
              </h1>

              <p className="mt-1 text-xs text-gray-500 sm:text-sm">
                1 unit. One game. No excuses.
              </p>
            </div>

            <div className="hidden shrink-0 text-right sm:block">
              <p className="text-2xl font-extrabold text-gray-900">
                {games.length}
              </p>
              <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">
                Games
              </p>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="mt-4 grid grid-cols-2 gap-2 sm:mt-5 sm:grid-cols-3">
            <button
              onClick={() => {
                window.location.href = "/wagers";
              }}
              className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 text-left transition hover:border-gray-300 hover:bg-gray-100"
            >
              <p className="text-[9px] font-extrabold uppercase tracking-wide text-gray-400">
                My Bets
              </p>

              <p className="mt-0.5 text-sm font-extrabold text-gray-900">
                {pendingPickCount > 0
                  ? `${pendingPickCount} Pending`
                  : "View Bets"}
              </p>
            </button>

            <button
              onClick={() => {
                window.location.href = "/leaderboard";
              }}
              className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 text-left transition hover:border-gray-300 hover:bg-gray-100"
            >
              <p className="text-[9px] font-extrabold uppercase tracking-wide text-gray-400">
                Competition
              </p>

              <p className="mt-0.5 text-sm font-extrabold text-gray-900">
                Leaderboard →
              </p>
            </button>

            <div className="col-span-2 rounded-xl border border-green-100 bg-green-50 px-3 py-3 sm:col-span-1">
              <p className="text-[9px] font-extrabold uppercase tracking-wide text-green-600">
                Your Action
              </p>

              <p className="mt-0.5 text-sm font-extrabold text-green-900">
                {gamesWithPicks > 0
                  ? `${gamesWithPicks} Pick${
                      gamesWithPicks === 1 ? "" : "s"
                    } Placed`
                  : "Pick a Game"}
              </p>
            </div>
          </div>
        </section>

        {/* Games */}
        <section className="mt-5 sm:mt-7">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-extrabold text-gray-900 sm:text-2xl">
                Games
              </h2>

              <p className="mt-0.5 text-xs text-gray-500 sm:text-sm">
                Choose a game and risk one unit.
              </p>
            </div>

            <div className="text-right sm:hidden">
              <p className="text-lg font-extrabold text-gray-900">
                {games.length}
              </p>
              <p className="text-[9px] font-bold uppercase tracking-wide text-gray-400">
                Available
              </p>
            </div>
          </div>

          {/* Filters */}
          <div className="mt-3 flex items-center justify-between rounded-xl border border-gray-200 bg-white p-1">
            <div className="flex items-center gap-0.5">
              <button
                onClick={() => setViewFilter("all")}
                className={filterButtonClass("all")}
              >
                All
              </button>

              <button
                onClick={() => setViewFilter("live")}
                className={filterButtonClass("live")}
              >
                Live
                {liveGames.length > 0 && (
                  <span className="ml-1.5 rounded-full bg-red-100 px-1.5 py-0.5 text-[9px] text-red-700">
                    {liveGames.length}
                  </span>
                )}
              </button>

              <button
                onClick={() => setViewFilter("upcoming")}
                className={filterButtonClass("upcoming")}
              >
                Upcoming
              </button>
            </div>

            <span className="hidden pr-2 text-[10px] font-medium text-gray-400 sm:block">
              {viewFilter === "live"
                ? `${liveGames.length} live`
                : viewFilter === "upcoming"
                ? `${upcomingGames.length} upcoming`
                : `${games.length} games`}
            </span>
          </div>

          {loading ? (
            <div className="mt-3 rounded-2xl bg-white p-6 shadow-sm">
              <p className="text-sm text-gray-500">
                Loading games...
              </p>
            </div>
          ) : message ? (
            <div className="mt-3 rounded-2xl bg-white p-6 shadow-sm">
              <p className="text-sm text-gray-500">
                {message}
              </p>
            </div>
          ) : games.length === 0 ? (
            <div className="mt-3 rounded-2xl bg-white p-6 shadow-sm">
              <p className="font-semibold text-gray-900">
                No upcoming games
              </p>

              <p className="mt-1 text-sm text-gray-500">
                Check back soon for new games.
              </p>
            </div>
          ) : (
            <div className="mt-4">

              {/* Live */}
              {filteredLiveGames.length > 0 ? (
                <section className="mb-6">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-red-500" />

                    <h3 className="text-xs font-extrabold uppercase tracking-wide text-red-700 sm:text-sm">
                      Live Now
                    </h3>
                  </div>

                  <div className="space-y-2.5 sm:space-y-3">
                    {filteredLiveGames.map(renderGameCard)}
                  </div>
                </section>
              ) : null}

              {/* Upcoming */}
              {Object.entries(groupedUpcoming).map(
                ([dayKey, dayGames]) => (
                  <section
                    key={dayKey}
                    className="mb-6"
                  >
                    <div className="mb-2 flex items-center justify-between border-b border-gray-200 pb-2">
                      <h3 className="text-xs font-extrabold uppercase tracking-wide text-gray-700 sm:text-sm">
                        {formatDayHeader(
                          dayGames[0].starts_at
                        )}
                      </h3>

                      <span className="text-[10px] font-medium text-gray-400">
                        {dayGames.length}{" "}
                        {dayGames.length === 1
                          ? "game"
                          : "games"}
                      </span>
                    </div>

                    <div className="space-y-2.5 sm:space-y-3">
                      {dayGames.map(renderGameCard)}
                    </div>
                  </section>
                )
              )}

              {/* Empty filtered state */}
              {filteredLiveGames.length === 0 &&
                filteredUpcomingGames.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-6 text-center">
                    <p className="font-semibold text-gray-900">
                      No games in this view
                    </p>

                    <p className="mt-1 text-sm text-gray-500">
                      Try another filter.
                    </p>
                  </div>
                )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}