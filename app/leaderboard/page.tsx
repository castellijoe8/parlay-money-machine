"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Pick = {
  user_id: string;
  result: string | null;
  units: number | null;
  created_at: string;
};

type LeaderboardRow = {
  user_id: string;
  user_name: string;
  wins: number;
  losses: number;
  pushes: number;
  total: number;
  net_units: number;
  streak: number;
  streakType: "W" | "L" | "P" | null;
};

type Profile = {
  id: string;
  display_name: string | null;
};

export default function LeaderboardPage() {
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    loadLeaderboard();
  }, []);

  async function loadLeaderboard() {
    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    setCurrentUserId(user?.id ?? null);

    const { data: picks, error: picksError } = await supabase
      .from("picks")
      .select("user_id, result, units, created_at")
      .order("created_at", { ascending: true });

    if (picksError) {
      console.error("Error loading picks:", picksError);
      setLoading(false);
      return;
    }

    if (!picks || picks.length === 0) {
      setLeaderboard([]);
      setLoading(false);
      return;
    }

    const userIds = [
      ...new Set(
        picks
          .map((pick) => pick.user_id)
          .filter(Boolean)
      ),
    ];

    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id, display_name")
      .in("id", userIds);

    if (profilesError) {
      console.error("Error loading profiles:", profilesError);
    }

    const profileMap = new Map<string, string>();

    (profiles ?? []).forEach((profile: Profile) => {
      profileMap.set(
        profile.id,
        profile.display_name || "Player"
      );
    });

    const stats: Record<
      string,
      LeaderboardRow & { results: string[] }
    > = {};

    picks.forEach((pick: Pick) => {
      if (!pick.user_id) return;

      const result = String(pick.result ?? "")
        .trim()
        .toLowerCase();

      if (
        result !== "win" &&
        result !== "loss" &&
        result !== "push"
      ) {
        return;
      }

      if (!stats[pick.user_id]) {
        stats[pick.user_id] = {
          user_id: pick.user_id,
          user_name:
            profileMap.get(pick.user_id) || "Player",
          wins: 0,
          losses: 0,
          pushes: 0,
          total: 0,
          net_units: 0,
          streak: 0,
          streakType: null,
          results: [],
        };
      }

      if (result === "win") {
        stats[pick.user_id].wins += 1;
      }

      if (result === "loss") {
        stats[pick.user_id].losses += 1;
      }

      if (result === "push") {
        stats[pick.user_id].pushes += 1;
      }

      stats[pick.user_id].total += 1;

      stats[pick.user_id].net_units += Number(
        pick.units ?? 0
      );

      stats[pick.user_id].results.push(result);
    });

    Object.values(stats).forEach((player) => {
      const results = player.results;

      if (results.length === 0) return;

      const latestResult = results[results.length - 1];

      let streak = 0;

      for (let i = results.length - 1; i >= 0; i--) {
        if (results[i] === latestResult) {
          streak += 1;
        } else {
          break;
        }
      }

      player.streak = streak;

      if (latestResult === "win") {
        player.streakType = "W";
      } else if (latestResult === "loss") {
        player.streakType = "L";
      } else {
        player.streakType = "P";
      }
    });

    const rows = Object.values(stats).map((player) => ({
      user_id: player.user_id,
      user_name: player.user_name,
      wins: player.wins,
      losses: player.losses,
      pushes: player.pushes,
      total: player.total,
      net_units: player.net_units,
      streak: player.streak,
      streakType: player.streakType,
    }));

    rows.sort((a, b) => {
      if (b.net_units !== a.net_units) {
        return b.net_units - a.net_units;
      }

      if (b.wins !== a.wins) {
        return b.wins - a.wins;
      }

      const aPercentage =
        a.total > 0 ? a.wins / a.total : 0;

      const bPercentage =
        b.total > 0 ? b.wins / b.total : 0;

      return bPercentage - aPercentage;
    });

    setLeaderboard(rows);
    setLoading(false);
  }

  function getStreakDisplay(player: LeaderboardRow) {
    if (!player.streak || !player.streakType) {
      return "—";
    }

    if (player.streakType === "W") {
      return player.streak >= 3
        ? `🔥 W${player.streak}`
        : `W${player.streak}`;
    }

    if (player.streakType === "L") {
      return player.streak >= 3
        ? `❄️ L${player.streak}`
        : `L${player.streak}`;
    }

    return `P${player.streak}`;
  }

  function getOracle() {
    if (leaderboard.length === 0) {
      return "The Oracle has nothing to say. Yet.";
    }

    const winningStreakPlayers = leaderboard.filter(
      (player) => player.streakType === "W"
    );

    const losingStreakPlayers = leaderboard.filter(
      (player) => player.streakType === "L"
    );

    const hottest = winningStreakPlayers.length
      ? [...winningStreakPlayers].sort(
          (a, b) => b.streak - a.streak
        )[0]
      : null;

    const coldest = losingStreakPlayers.length
      ? [...losingStreakPlayers].sort(
          (a, b) => b.streak - a.streak
        )[0]
      : null;

    const leader = leaderboard[0];

    const positivePlayers = leaderboard.filter(
      (player) => player.net_units > 0
    );

    const negativePlayers = leaderboard.filter(
      (player) => player.net_units < 0
    );

    const maxStreak = hottest?.streak ?? 0;
    const maxLosingStreak = coldest?.streak ?? 0;

    if (maxLosingStreak >= 5 && coldest) {
      return `${coldest.user_name} has lost ${maxLosingStreak} straight. At this point the picks are being generated by a hostile entity.`;
    }

    if (maxStreak >= 6 && hottest) {
      return `${hottest.user_name} is on a ${maxStreak}-game heater. This is usually when the universe begins preparing the invoice.`;
    }

    if (
      leaderboard.length >= 2 &&
      Math.abs(
        leaderboard[0].net_units -
          leaderboard[1].net_units
      ) < 1
    ) {
      return `The difference between first and second is currently one terrible decision.`;
    }

    if (
      positivePlayers.length === 0 &&
      leaderboard.length >= 2
    ) {
      return `Nobody is profitable. The leaderboard has become a crime scene.`;
    }

    if (
      negativePlayers.length >=
      Math.ceil(leaderboard.length * 0.75)
    ) {
      return `Most of the leaderboard is losing money. The sportsbook would like to thank everyone for their continued service.`;
    }

    if (leader.net_units >= 5) {
      return `${leader.user_name} has opened up a commanding lead. This will make the eventual collapse much funnier.`;
    }

    if (
      leader.streakType === "W" &&
      leader.streak >= 3
    ) {
      return `${leader.user_name} is on a ${leader.streak}-game winning streak. Confidence is now the biggest liability.`;
    }

    if (
      leader.streakType === "L" &&
      leader.streak >= 3
    ) {
      return `${leader.user_name} has lost ${leader.streak} straight. A bold strategy. Unfortunately, it appears to be the wrong one.`;
    }

    if (leaderboard.length >= 3) {
      return `Someone on this leaderboard is about to make a terrible decision. Unfortunately, everyone qualifies.`;
    }

    return `The numbers have been reviewed. The numbers regret getting involved.`;
  }

  return (
    <main className="mx-auto max-w-6xl px-3 py-6 sm:px-6 sm:py-10">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-3xl font-bold text-gray-900">
          Leaderboard
        </h1>

        <p className="mt-2 text-sm text-gray-600 sm:text-base">
          See who&apos;s winning the most wagers.
        </p>
      </div>

      {loading ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <p className="text-gray-600">
            Loading leaderboard...
          </p>
        </div>
      ) : leaderboard.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <p className="text-gray-600">
            No completed wagers yet.
          </p>
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <div className="grid grid-cols-[28px_minmax(0,1fr)_32px_32px_48px_72px_58px] items-center border-b border-gray-200 bg-gray-50 px-3 py-3 text-[11px] font-semibold text-gray-500 sm:grid-cols-[40px_minmax(0,1fr)_60px_60px_70px_90px_80px] sm:px-6 sm:py-4 sm:text-sm">
              <div>#</div>

              <div>Player</div>

              <div className="text-center">
                W
              </div>

              <div className="text-center">
                L
              </div>

              <div className="text-center">
                %
              </div>

              <div className="text-center">
                Units
              </div>

              <div className="text-center">
                Streak
              </div>
            </div>

            {leaderboard.map((player, index) => {
              const winPercentage =
                player.total > 0
                  ? Math.round(
                      (player.wins / player.total) * 100
                    )
                  : 0;

              const isCurrentUser =
                player.user_id === currentUserId;

              return (
                <div
                  key={player.user_id}
                  className={`grid grid-cols-[28px_minmax(0,1fr)_32px_32px_48px_72px_58px] items-center border-b px-3 py-3 last:border-b-0 sm:grid-cols-[40px_minmax(0,1fr)_60px_60px_70px_90px_80px] sm:px-6 sm:py-4 ${
                    isCurrentUser
                      ? "border-green-200 border-l-4 bg-green-50"
                      : "border-gray-100"
                  }`}
                >
                  <div
                    className={`font-bold ${
                      isCurrentUser
                        ? "text-green-700"
                        : "text-gray-400"
                    }`}
                  >
                    {index + 1}
                  </div>

                  <div className="min-w-0 font-semibold text-gray-900">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="block min-w-0 truncate">
                        {player.user_name}
                      </span>

                      {isCurrentUser ? (
                        <span className="shrink-0 rounded-full bg-green-600 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
                          You
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="text-center text-sm font-semibold text-green-600 sm:text-base">
                    {player.wins}
                  </div>

                  <div className="text-center text-sm font-semibold text-red-600 sm:text-base">
                    {player.losses}
                  </div>

                  <div className="text-center text-sm font-semibold text-gray-900 sm:text-base">
                    {winPercentage}%
                  </div>

                  <div
                    className={`text-center text-sm font-bold sm:text-base ${
                      player.net_units > 0
                        ? "text-green-600"
                        : player.net_units < 0
                        ? "text-red-600"
                        : "text-gray-900"
                    }`}
                  >
                    {player.net_units > 0 ? "+" : ""}
                    {player.net_units.toFixed(2)}
                  </div>

                  <div
                    className={`text-center text-[11px] font-bold sm:text-sm ${
                      player.streakType === "W" &&
                      player.streak >= 3
                        ? "text-orange-600"
                        : player.streakType === "L" &&
                          player.streak >= 3
                        ? "text-blue-500"
                        : "text-gray-600"
                    }`}
                  >
                    {getStreakDisplay(player)}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-8 border-t border-gray-200 pt-6 text-center">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400">
              The Oracle Has Spoken
            </p>

            <p className="mx-auto mt-2 max-w-2xl text-sm italic leading-6 text-gray-500">
              &ldquo;{getOracle()}&rdquo;
            </p>
          </div>
        </>
      )}
    </main>
  );
}