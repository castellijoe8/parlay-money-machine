"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Sport = "ncaaf" | "nfl";
type SportFilter = "all" | Sport;

type Game = {
  id: string;
  away_team: string | null;
  home_team: string | null;
  starts_at: string | null;
  sport: Sport | null;
};

type FriendWager = {
  id: string;
  game_id: string;
  user_id: string;
  user_name: string | null;
  pick: string;
  bet_type: string | null;
  line: number | null;
  odds: number | null;
  result: string | null;
  units: number | null;
  created_at: string;
  game: Game | Game[] | null;
};

type Player = {
  id: string;
  name: string;
};

type PlayerStats = {
  wins: number;
  losses: number;
  pushes: number;
  netUnits: number;
  pending: number;
  streak: number;
  streakType: "win" | "loss" | "push" | null;
};

function gameFor(wager: FriendWager): Game | null {
  return Array.isArray(wager.game) ? wager.game[0] ?? null : wager.game;
}

function normalizedResult(result: string | null) {
  return result?.trim().toLowerCase() ?? "pending";
}

function normalizedBetType(betType: string | null) {
  const type = betType?.trim().toLowerCase() ?? "";

  if (type.includes("spread") || type === "ats") {
    return "spread";
  }

  if (type.includes("moneyline") || type === "ml") {
    return "moneyline";
  }

  if (type.includes("total") || type === "over" || type === "under") {
    return "total";
  }

  return type;
}

function formatLine(line: number | null) {
  if (line === null) return null;
  return line > 0 ? `+${line}` : String(line);
}

function formatOdds(odds: number | null) {
  if (odds === null) return null;
  return odds > 0 ? `+${odds}` : String(odds);
}

function formatPick(wager: FriendWager) {
  const line = formatLine(wager.line);

  return line && normalizedBetType(wager.bet_type) !== "moneyline"
    ? `${wager.pick} ${line}`
    : wager.pick;
}

function formatDate(timestamp: string) {
  const date = new Date(timestamp);

  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function calculateStats(wagers: FriendWager[]): PlayerStats {
  const settled = wagers
    .filter((wager) =>
      ["win", "loss", "push"].includes(normalizedResult(wager.result))
    )
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() -
        new Date(a.created_at).getTime()
    );

  const stats: PlayerStats = {
    wins: 0,
    losses: 0,
    pushes: 0,
    netUnits: 0,
    pending: wagers.length - settled.length,
    streak: 0,
    streakType: null,
  };

  settled.forEach((wager) => {
    const result = normalizedResult(wager.result) as
      | "win"
      | "loss"
      | "push";

    if (result === "win") stats.wins += 1;
    if (result === "loss") stats.losses += 1;
    if (result === "push") stats.pushes += 1;

    stats.netUnits += Number(wager.units ?? 0);
  });

  const latestResult = normalizedResult(settled[0]?.result);

  if (
    latestResult === "win" ||
    latestResult === "loss" ||
    latestResult === "push"
  ) {
    stats.streakType = latestResult;

    for (const wager of settled) {
      if (normalizedResult(wager.result) !== latestResult) {
        break;
      }

      stats.streak += 1;
    }
  }

  return stats;
}

function areOpposite(theirPick: FriendWager, yourPick: FriendWager) {
  if (theirPick.game_id !== yourPick.game_id) {
    return false;
  }

  const theirType = normalizedBetType(theirPick.bet_type);
  const yourType = normalizedBetType(yourPick.bet_type);

  if (theirType !== yourType) {
    return false;
  }

  const theirs = theirPick.pick.trim().toLowerCase();
  const yours = yourPick.pick.trim().toLowerCase();

  if (theirType === "total") {
    return (
      theirPick.line === yourPick.line &&
      ((theirs === "over" && yours === "under") ||
        (theirs === "under" && yours === "over"))
    );
  }

  if (theirType === "moneyline") {
    return theirs !== yours;
  }

  if (theirType === "spread") {
    return (
      theirs !== yours &&
      theirPick.line !== null &&
      yourPick.line !== null &&
      theirPick.line === -yourPick.line
    );
  }

  return false;
}

export default function FriendsWagersPage() {
  const [wagers, setWagers] = useState<FriendWager[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [selectedPlayerId, setSelectedPlayerId] = useState("all");
  const [sportFilter, setSportFilter] = useState<SportFilter>("all");

  useEffect(() => {
    async function loadWagers() {
      setLoading(true);
      setMessage("");

      const [{ data: authData }, { data, error }] = await Promise.all([
        supabase.auth.getUser(),
        supabase
          .from("picks")
          .select(
            "id, game_id, user_id, user_name, pick, bet_type, line, odds, result, units, created_at, game:games (id, away_team, home_team, starts_at, sport)"
          )
          .order("created_at", { ascending: false }),
      ]);

      setCurrentUserId(authData.user?.id ?? null);

      if (error) {
        console.error("Friends feed error:", error);
        setMessage("Unable to load your crew's picks.");
        setLoading(false);
        return;
      }

      const picks = (data ?? []) as unknown as FriendWager;

      const pickRows = Array.isArray(picks) ? picks : [];

      const userIds = [
        ...new Set(
          pickRows.map((wager) => wager.user_id).filter(Boolean)
        ),
      ];

      let profileMap: Record<string, string> = {};

      if (userIds.length) {
        const {
          data: profiles,
          error: profilesError,
        } = await supabase
          .from("profiles")
          .select("id, display_name")
          .in("id", userIds);

        if (profilesError) {
          console.error("Friend profile lookup error:", profilesError);
        } else {
          profileMap = Object.fromEntries(
            (profiles ?? [])
              .filter((profile) => profile.display_name?.trim())
              .map((profile) => [
                profile.id,
                profile.display_name.trim(),
              ])
          );
        }
      }

      setWagers(
        pickRows.map((wager) => ({
          ...wager,
          user_name:
            profileMap[wager.user_id] ||
            wager.user_name ||
            "Player",
        }))
      );

      setLoading(false);
    }

    void loadWagers();
  }, []);

  const players = useMemo<Player[]>(() => {
    const names = new Map<string, string>();

    wagers.forEach((wager) => {
      names.set(wager.user_id, wager.user_name || "Player");
    });

    return [...names.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [wagers]);

  const selectedPlayer = players.find(
    (player) => player.id === selectedPlayerId
  );

  const visibleWagers = useMemo(
    () =>
      wagers.filter((wager) => {
        const game = gameFor(wager);

        const playerMatches =
          selectedPlayerId === "all" ||
          wager.user_id === selectedPlayerId;

        const sportMatches =
          sportFilter === "all" || game?.sport === sportFilter;

        return playerMatches && sportMatches;
      }),
    [wagers, selectedPlayerId, sportFilter]
  );

  const selectedPlayerStats = useMemo(
    () =>
      selectedPlayerId === "all"
        ? null
        : calculateStats(
            wagers.filter(
              (wager) => wager.user_id === selectedPlayerId
            )
          ),
    [wagers, selectedPlayerId]
  );

  const yourPicks = useMemo(
    () =>
      wagers.filter(
        (wager) => wager.user_id === currentUserId
      ),
    [wagers, currentUserId]
  );

  const emptyMessage =
    sportFilter !== "all"
      ? `No ${sportFilter.toUpperCase()} picks found.`
      : selectedPlayer
        ? `${selectedPlayer.name} hasn't made any picks yet.`
        : "No picks from your crew yet.";

  return (
    <main className="min-h-screen bg-[#f5f7f4] px-4 py-6 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-3xl">
        <section className="rounded-2xl border border-[#18453B]/15 bg-[#18453B] px-5 py-6 text-white shadow-sm sm:px-7">
          <p className="brand-font text-lg text-[#d8e9b8]">
            Parlay Money Machine
          </p>

          <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
            {selectedPlayer
              ? `${selectedPlayer.name}'s Picks`
              : "Friends"}
          </h1>

          <p className="mt-1 text-sm text-white/70">
            Unfriendly competition for terrible gamblers.
          </p>

          <div className="mt-5 flex gap-3 overflow-x-auto pb-1">
            <label className="min-w-[174px] flex-1 sm:max-w-xs">
              <span className="mb-1.5 block text-[11px] font-bold tracking-[0.16em] text-[#d8e9b8]">
                VIEW PICKS FROM
              </span>

              <select
                value={selectedPlayerId}
                onChange={(event) =>
                  setSelectedPlayerId(event.target.value)
                }
                className="w-full rounded-lg border border-white/25 bg-white px-3 py-2.5 text-sm font-bold text-[#18453B] outline-none focus:ring-2 focus:ring-[#d8e9b8]"
              >
                <option value="all">All Players</option>

                {players.map((player) => (
                  <option key={player.id} value={player.id}>
                    {player.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="min-w-[140px] flex-1 sm:max-w-[190px]">
              <span className="mb-1.5 block text-[11px] font-bold tracking-[0.16em] text-[#d8e9b8]">
                SPORT
              </span>

              <select
                value={sportFilter}
                onChange={(event) =>
                  setSportFilter(
                    event.target.value as SportFilter
                  )
                }
                className="w-full rounded-lg border border-white/25 bg-white px-3 py-2.5 text-sm font-bold text-[#18453B] outline-none focus:ring-2 focus:ring-[#d8e9b8]"
              >
                <option value="all">All Sports</option>
                <option value="nfl">NFL</option>
                <option value="ncaaf">NCAAF</option>
              </select>
            </label>
          </div>
        </section>

        {selectedPlayerStats && (
          <section className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-[#18453B]/15 bg-[#18453B]/10 sm:grid-cols-5">
            {[
              [
                "Record",
                `${selectedPlayerStats.wins}–${selectedPlayerStats.losses}–${selectedPlayerStats.pushes}`,
              ],
              [
                "Net units",
                `${selectedPlayerStats.netUnits > 0 ? "+" : ""}${selectedPlayerStats.netUnits.toFixed(2)}u`,
              ],
              [
                "Win rate",
                `${
                  selectedPlayerStats.wins +
                    selectedPlayerStats.losses
                    ? Math.round(
                        (selectedPlayerStats.wins /
                          (selectedPlayerStats.wins +
                            selectedPlayerStats.losses)) *
                          100
                      )
                    : 0
                }%`,
              ],
              [
                "Streak",
                selectedPlayerStats.streak
                  ? `${
                      selectedPlayerStats.streakType === "win" &&
                      selectedPlayerStats.streak >= 3
                        ? "🔥 "
                        : ""
                    }${selectedPlayerStats.streakType?.[0].toUpperCase()}${selectedPlayerStats.streak}`
                  : "—",
              ],
              ["Pending", String(selectedPlayerStats.pending)],
            ].map(([label, value]) => (
              <div
                key={label}
                className="bg-white px-4 py-3"
              >
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                  {label}
                </p>
                <p className="mt-1 text-lg font-black text-[#18453B]">
                  {value}
                </p>
              </div>
            ))}
          </section>
        )}

        <section className="mt-6">
          <div className="mb-3 flex items-end justify-between">
            <h2 className="brand-font text-3xl text-[#18453B]">
              {selectedPlayer
                ? `${selectedPlayer.name}'s picks`
                : "The feed"}
            </h2>

            <span className="text-xs font-semibold text-gray-500">
              Newest first
            </span>
          </div>

          {loading ? (
            <FeedState text="Loading the crew's picks..." />
          ) : message ? (
            <FeedState text={message} />
          ) : visibleWagers.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-10 text-center">
              <p className="font-semibold text-gray-700">
                {emptyMessage}
              </p>

              <Link
                href="/"
                className="mt-3 inline-block text-sm font-bold text-[#18453B] underline underline-offset-4"
              >
                Make your first pick
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {visibleWagers.map((wager) => {
                const game = gameFor(wager);
                const result = normalizedResult(wager.result);

                const opposition =
                  currentUserId &&
                  wager.user_id !== currentUserId
                    ? yourPicks.find((yourPick) =>
                        areOpposite(wager, yourPick)
                      )
                    : undefined;

                const resultClass =
                  result === "win"
                    ? "bg-green-100 text-green-800"
                    : result === "loss"
                      ? "bg-red-100 text-red-700"
                      : result === "push"
                        ? "bg-gray-200 text-gray-700"
                        : "bg-amber-100 text-amber-800";

                const units = Number(wager.units ?? 0);

                return (
                  <article
                    key={wager.id}
                    className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition hover:border-[#18453B]/35"
                  >
                    <Link
                      href={
                        wager.game_id
                          ? `/wager/${wager.game_id}`
                          : "/friends"
                      }
                      className="block p-4 sm:p-5"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <p className="text-xs font-black uppercase tracking-[0.12em] text-[#18453B]">
                            {wager.user_name}
                          </p>

                          <p className="mt-1 truncate text-sm text-gray-500">
                            {game?.away_team && game?.home_team
                              ? `${game.away_team} @ ${game.home_team}`
                              : "Game details unavailable"}
                          </p>

                          <p className="mt-2 text-xl font-black text-gray-950 sm:text-2xl">
                            {formatPick(wager)}
                          </p>
                        </div>

                        <span
                          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-black ${resultClass}`}
                        >
                          {result === "pending"
                            ? "PENDING"
                            : result.toUpperCase()}
                        </span>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-sm text-gray-600">
                        <span>{wager.bet_type || "Bet"}</span>
                        <span>·</span>
                        <span>{formatOdds(wager.odds) || "—"}</span>
                        <span>·</span>
                        <span>1.0 unit</span>

                        {result !== "pending" && (
                          <>
                            <span>·</span>
                            <span
                              className={`font-bold ${
                                result === "win"
                                  ? "text-green-700"
                                  : result === "loss"
                                    ? "text-red-600"
                                    : "text-gray-600"
                              }`}
                            >
                              {result === "push"
                                ? "0.00u"
                                : `${units > 0 ? "+" : ""}${units.toFixed(2)}u`}
                            </span>
                          </>
                        )}
                      </div>

                      <p className="mt-3 text-xs font-medium text-gray-400">
                        {formatDate(wager.created_at)}
                      </p>
                    </Link>

                    {opposition && (
                      <div className="border-t border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 sm:px-5">
                        <span className="font-black">
                          ⚔️ YOU&apos;RE OPPOSITE
                        </span>

                        <span className="mx-2 text-amber-400">
                          ·
                        </span>

                        <span>
                          Your pick:{" "}
                          <strong>
                            {formatPick(opposition)}
                          </strong>
                        </span>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function FeedState({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 text-center text-gray-500">
      {text}
    </div>
  );
}