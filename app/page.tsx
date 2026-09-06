"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Game = {
  id: string;
  external_id: string;
  starts_at: string;
  away_team: string;
  home_team: string;
  spread: number | null;
  status: string;
};

type Profile = {
  id: string;
  display_name: string;
};

type Group = {
  id: string;
  name: string;
};

type LeaderboardRow = {
  user_id: string;
  display_name: string;
  wins: number;
  losses: number;
  graded_picks: number;
  win_percentage: number;
  units: number;
};

export default function Home() {
  const [games, setGames] = useState<Game[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [group, setGroup] = useState<Group | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [selectedPicks, setSelectedPicks] = useState<
    Record<string, string>
  >({});
  const [submittedGames, setSubmittedGames] = useState<
    Record<string, boolean>
  >({});
  const [showMore, setShowMore] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      setLoading(true);

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        console.error("Error getting user:", userError);
        setLoading(false);
        return;
      }

      const { data: existingProfile, error: profileError } =
        await supabase
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .maybeSingle();

      if (profileError) {
        console.error("Error loading profile:", profileError);
      }

      if (existingProfile) {
        setProfile(existingProfile);
      } else {
        const { data: newProfile, error: createProfileError } =
          await supabase
            .from("profiles")
            .insert({
              id: user.id,
              display_name: "Joe",
            })
            .select()
            .single();

        if (createProfileError) {
          console.error(
            "Error creating profile:",
            createProfileError
          );
        } else {
          setProfile(newProfile);
        }
      }

      const { data: membership, error: membershipError } =
        await supabase
          .from("group_members")
          .select("group_id")
          .eq("user_id", user.id)
          .limit(1)
          .maybeSingle();

      if (membershipError) {
        console.error(
          "Error loading group membership:",
          membershipError
        );
      }

      if (membership) {
        const { data: groupData, error: groupError } =
          await supabase
            .from("groups")
            .select("*")
            .eq("id", membership.group_id)
            .single();

        if (groupError) {
          console.error("Error loading group:", groupError);
        } else {
          setGroup(groupData);
        }
      }

      const { data: gameData, error: gameError } =
        await supabase
          .from("games")
          .select("*")
          .neq("external_id", "test-washington-oregon")
          .eq("status", "scheduled")
          .order("starts_at", { ascending: true });

      if (gameError) {
        console.error("Error loading games:", gameError);
      } else {
        setGames(gameData || []);
      }

      const { data: leaderboardData, error: leaderboardError } =
        await supabase
          .from("leaderboard")
          .select("*");

      if (leaderboardError) {
        console.error(
          "Error loading leaderboard:",
          leaderboardError
        );
      } else {
        setLeaderboard(leaderboardData || []);
      }

      setLoading(false);
    }

    loadData();
  }, []);

  async function makePick(game: Game) {
    const pick = selectedPicks[game.id];

    if (!pick || !game || !profile) return;

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      console.error("No logged-in user found");
      return;
    }

    const isAwayPick =
      pick === `${game.away_team} +${game.spread}`;

    const selectedLine =
      game.spread !== null
        ? isAwayPick
          ? game.spread
          : -game.spread
        : null;

    const { error } = await supabase.from("picks").insert({
      game_id: game.id,
      user_id: user.id,
      user_name: profile.display_name,
      pick: pick,
      bet_type: "spread",
      line: selectedLine,
      odds: -110,
      result: "pending",
      units: 1,
    });

    if (error) {
      console.error("Error saving pick:", error);
      return;
    }

    setSubmittedGames((current) => ({
      ...current,
      [game.id]: true,
    }));
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-950 text-white">
        <div className="mx-auto max-w-4xl px-6 py-10">
          <p className="text-slate-400">
            Loading games...
          </p>
        </div>
      </main>
    );
  }

  const visibleGames = showMore ? games : games.slice(0, 10);

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-4xl px-6 py-10">

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold">
              Parlay Money Machine
            </h1>

            <p className="mt-2 text-slate-400">
              College Football picks with the biggest group of
              shit gamblers.
            </p>
          </div>

          {profile && (
            <div className="rounded-xl bg-slate-800 px-4 py-2 text-sm">
              <span className="text-slate-400">
                Logged in as{" "}
              </span>

              <span className="font-bold">
                {profile.display_name}
              </span>
            </div>
          )}
        </div>

        {group && (
          <div className="mt-8 rounded-2xl bg-slate-900 p-6">
            <div className="text-sm text-slate-400">
              YOUR GROUP
            </div>

            <div className="mt-1 text-2xl font-bold">
              {group.name}
            </div>

            <div className="mt-2 text-sm text-slate-500">
              Private college football picks
            </div>
          </div>
        )}

        <div className="mt-8">
          <h2 className="text-2xl font-bold">
            Upcoming Games
          </h2>

          <div className="mt-4 space-y-5">
            {visibleGames.map((game) => {
              const awayPick = `${game.away_team} +${game.spread}`;
              const homePick = `${game.home_team} -${game.spread}`;

              const selectedPick = selectedPicks[game.id];
              const submitted = submittedGames[game.id];

              return (
                <div
                  key={game.id}
                  className="rounded-2xl bg-slate-900 p-6"
                >
                  <div className="text-sm font-semibold text-slate-400">
                    {new Date(
                      game.starts_at
                    ).toLocaleDateString()}{" "}
                    ·{" "}
                    {new Date(
                      game.starts_at
                    ).toLocaleTimeString([], {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </div>

                  <h3 className="mt-2 text-xl font-bold">
                    {game.away_team}{" "}
                    <span className="text-slate-500">
                      @
                    </span>{" "}
                    {game.home_team}
                  </h3>

                  {game.spread !== null ? (
                    <>
                      <div className="mt-5 grid gap-3 sm:grid-cols-2">
                        <button
                          onClick={() => {
                            setSelectedPicks((current) => ({
                              ...current,
                              [game.id]: awayPick,
                            }));

                            setSubmittedGames((current) => ({
                              ...current,
                              [game.id]: false,
                            }));
                          }}
                          className={`rounded-xl border p-4 text-left ${
                            selectedPick === awayPick
                              ? "border-white bg-white text-slate-950"
                              : "border-slate-700 bg-slate-800 hover:bg-slate-700"
                          }`}
                        >
                          <div className="font-bold">
                            {game.away_team}
                          </div>

                          <div className="mt-1 opacity-70">
                            +{game.spread}
                          </div>

                          <div className="mt-1 text-sm opacity-50">
                            -110
                          </div>
                        </button>

                        <button
                          onClick={() => {
                            setSelectedPicks((current) => ({
                              ...current,
                              [game.id]: homePick,
                            }));

                            setSubmittedGames((current) => ({
                              ...current,
                              [game.id]: false,
                            }));
                          }}
                          className={`rounded-xl border p-4 text-left ${
                            selectedPick === homePick
                              ? "border-white bg-white text-slate-950"
                              : "border-slate-700 bg-slate-800 hover:bg-slate-700"
                          }`}
                        >
                          <div className="font-bold">
                            {game.home_team}
                          </div>

                          <div className="mt-1 opacity-70">
                            -{game.spread}
                          </div>

                          <div className="mt-1 text-sm opacity-50">
                            -110
                          </div>
                        </button>
                      </div>

                      <button
                        onClick={() => makePick(game)}
                        disabled={!selectedPick || submitted}
                        className="mt-4 w-full rounded-xl bg-white px-6 py-3 font-bold text-slate-950 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {submitted
                          ? "Pick Submitted ✓"
                          : "Make Pick — 1 Unit"}
                      </button>

                      {submitted && (
                        <div className="mt-3 text-center text-sm text-slate-400">
                          {selectedPick} · 1 unit at -110
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="mt-4 text-sm text-slate-500">
                      Spread unavailable
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {games.length > 10 && (
            <button
              onClick={() => setShowMore(!showMore)}
              className="mt-6 w-full rounded-xl border border-slate-700 bg-slate-900 px-6 py-4 font-bold hover:bg-slate-800"
            >
              {showMore ? "Show Less" : "More Games"}
            </button>
          )}
        </div>

        <div className="mt-12">
          <h2 className="text-2xl font-bold">
            {group?.name || "The Boys"} Leaderboard
          </h2>

          <div className="mt-4 overflow-hidden rounded-2xl bg-slate-900">
            {leaderboard.length === 0 ? (
              <div className="px-5 py-6 text-center text-slate-500">
                No graded picks yet.
              </div>
            ) : (
              leaderboard.map((player, index) => (
                <div
                  key={player.user_id}
                  className={`flex justify-between px-5 py-4 ${
                    index < leaderboard.length - 1
                      ? "border-b border-slate-800"
                      : ""
                  }`}
                >
                  <div>
                    <div className="font-bold">
                      {index + 1}. {player.display_name}
                    </div>

                    <div className="mt-1 text-sm text-slate-500">
                      {player.wins}–{player.losses} ·{" "}
                      {player.win_percentage.toFixed(1)}%
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="font-bold">
                      {Number(player.units) >= 0 ? "+" : ""}
                      {Number(player.units).toFixed(2)}
                    </div>

                    <div className="text-sm text-slate-500">
                      units
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

      </div>
    </main>
  );
}