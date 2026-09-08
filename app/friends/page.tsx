"use client";

import { useEffect, useState } from "react";
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
  } | null;
};

export default function FriendsWagersPage() {
  const [wagers, setWagers] = useState<FriendWager[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

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
            starts_at
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

  function formatDate(date: string) {
    return new Date(date).toLocaleString([], {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function wagerDetails(wager: FriendWager) {
    const parts: string[] = [];

    if (wager.bet_type) {
      parts.push(wager.bet_type);
    }

    if (wager.line !== null) {
      parts.push(
        wager.line > 0
          ? `+${wager.line}`
          : String(wager.line)
      );
    }

    if (wager.odds !== null) {
      parts.push(
        wager.odds > 0
          ? `+${wager.odds}`
          : String(wager.odds)
      );
    }

    return parts.join(" ");
  }

  function resultStyle(result: string | null) {
    const value = result?.toLowerCase();

    if (value === "win") {
      return "bg-green-100 text-green-800";
    }

    if (value === "loss") {
      return "bg-red-100 text-red-800";
    }

    if (value === "push") {
      return "bg-gray-100 text-gray-700";
    }

    return "bg-yellow-100 text-yellow-800";
  }

  function resultLabel(result: string | null) {
    if (!result || result === "pending") {
      return "Pending";
    }

    return result;
  }

  return (
    <main className="min-h-screen bg-gray-50 px-6 py-8">
      <div className="mx-auto max-w-4xl">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            Friends' Wagers
          </h1>

          <p className="mt-1 text-gray-500">
            See what everyone is riding.
          </p>
        </div>

        {loading ? (
          <div className="mt-8 rounded-xl bg-white p-6 shadow-sm">
            <p className="text-gray-500">
              Loading friends' wagers...
            </p>
          </div>
        ) : message ? (
          <div className="mt-8 rounded-xl bg-white p-6 shadow-sm">
            <p className="text-gray-500">{message}</p>
          </div>
        ) : wagers.length === 0 ? (
          <div className="mt-8 rounded-xl bg-white p-6 shadow-sm">
            <p className="text-gray-500">
              No wagers have been submitted yet.
            </p>
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            {wagers.map((wager) => (
              <div
                key={wager.id}
                className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
              >
                <div className="flex items-start justify-between gap-6">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-gray-900">
                      {wager.user_name}
                    </p>

                    {wager.game && (
                      <>
                        <h2 className="mt-1 text-lg font-bold text-gray-900">
                          {wager.game.away_team} vs.{" "}
                          {wager.game.home_team}
                        </h2>

                        <p className="mt-1 text-sm text-gray-500">
                          {formatDate(wager.game.starts_at)}
                        </p>
                      </>
                    )}

                    <div className="mt-4">
                      <p className="text-sm text-gray-500">
                        Pick
                      </p>

                      <p className="mt-1 text-base font-bold text-gray-900">
                        {wager.pick}
                      </p>

                      {wagerDetails(wager) && (
                        <p className="mt-1 text-sm text-gray-500">
                          {wagerDetails(wager)}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="shrink-0 text-right">
                    <p className="text-lg font-bold text-gray-900">
                      1 Unit
                    </p>

                    <span
                      className={`mt-2 inline-block rounded-full px-3 py-1 text-xs font-semibold ${resultStyle(
                        wager.result
                      )}`}
                    >
                      {resultLabel(wager.result)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}