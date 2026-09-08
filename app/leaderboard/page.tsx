"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type LeaderboardRow = {
  user_id: string;
  user_name: string;
  wins: number;
  losses: number;
  total: number;
  net_units: number;
};

type Profile = {
  id: string;
  display_name: string | null;
};

export default function LeaderboardPage() {
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLeaderboard();
  }, []);

  async function loadLeaderboard() {
    setLoading(true);

    const { data: picks, error: picksError } = await supabase
      .from("picks")
      .select("user_id, result, odds");

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

    const { data: profiles, error: profilesError } =
      await supabase
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

    const stats: Record<string, LeaderboardRow> = {};

    picks.forEach((pick) => {
      if (!pick.user_id) return;

      const result = String(pick.result ?? "")
        .trim()
        .toLowerCase();

      if (result !== "win" && result !== "loss") {
        return;
      }

      if (!stats[pick.user_id]) {
        stats[pick.user_id] = {
          user_id: pick.user_id,
          user_name:
            profileMap.get(pick.user_id) || "Player",
          wins: 0,
          losses: 0,
          total: 0,
          net_units: 0,
        };
      }

      if (result === "win") {
        stats[pick.user_id].wins += 1;

        const odds = Number(pick.odds);

        let profit = 1;

        if (!isNaN(odds)) {
          if (odds < 0) {
            profit = 100 / Math.abs(odds);
          } else {
            profit = odds / 100;
          }
        }

        stats[pick.user_id].net_units += profit;
      }

      if (result === "loss") {
        stats[pick.user_id].losses += 1;
        stats[pick.user_id].net_units -= 1;
      }

      stats[pick.user_id].total += 1;
    });

    const rows = Object.values(stats);

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

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">
          Leaderboard
        </h1>

        <p className="mt-2 text-gray-600">
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
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="grid grid-cols-14 border-b border-gray-200 bg-gray-50 px-6 py-4 text-sm font-semibold text-gray-600">
            <div className="col-span-1">#</div>

            <div className="col-span-5">
              Player
            </div>

            <div className="col-span-2 text-center">
              W
            </div>

            <div className="col-span-2 text-center">
              L
            </div>

            <div className="col-span-2 text-center">
              %
            </div>

            <div className="col-span-2 text-center">
              Net Units
            </div>
          </div>

          {leaderboard.map((player, index) => {
            const winPercentage =
              player.total > 0
                ? Math.round(
                    (player.wins / player.total) * 100
                  )
                : 0;

            return (
              <div
                key={player.user_id}
                className="grid grid-cols-14 items-center border-b border-gray-100 px-6 py-4 last:border-b-0"
              >
                <div className="col-span-1 font-bold text-gray-500">
                  {index + 1}
                </div>

                <div className="col-span-5 font-semibold text-gray-900">
                  {player.user_name}
                </div>

                <div className="col-span-2 text-center font-semibold text-green-600">
                  {player.wins}
                </div>

                <div className="col-span-2 text-center font-semibold text-red-600">
                  {player.losses}
                </div>

                <div className="col-span-2 text-center font-semibold text-gray-900">
                  {winPercentage}%
                </div>

                <div
                  className={`col-span-2 text-center font-bold ${
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
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}