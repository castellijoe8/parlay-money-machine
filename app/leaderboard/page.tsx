"use client";

import { useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";

type Pick = {
  user_id: string;
  result: string | null;
  units: number | null;
  created_at: string;
  game:
    | { sport: "ncaaf" | "nfl" | null }
    | Array<{ sport: "ncaaf" | "nfl" | null }>
    | null;
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
  const [sportFilter, setSportFilter] = useState<"all" | "nfl" | "ncaaf">(
    "all"
  );

  async function loadLeaderboard() {
    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    setCurrentUserId(user?.id ?? null);

    const { data: picks, error: picksError } = await supabase
      .from("picks")
      .select("user_id, result, units, created_at, game:games(sport)")
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
      ...new Set(picks.map((pick) => pick.user_id).filter(Boolean)),
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
      profileMap.set(profile.id, profile.display_name || "Player");
    });

    const stats: Record<
      string,
      LeaderboardRow & { results: string[] }
    > = {};

    picks.forEach((pick: Pick) => {
      if (!pick.user_id) return;

      const game = Array.isArray(pick.game) ? pick.game[0] : pick.game;

      if (sportFilter !== "all" && game?.sport !== sportFilter) return;

      const result = String(pick.result ?? "")
        .trim()
        .toLowerCase();

      if (result !== "win" && result !== "loss" && result !== "push") {
        return;
      }

      if (!stats[pick.user_id]) {
        stats[pick.user_id] = {
          user_id: pick.user_id,
          user_name: profileMap.get(pick.user_id) || "Player",
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
      stats[pick.user_id].net_units += Number(pick.units ?? 0);
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

      const aPercentage = a.total > 0 ? a.wins / a.total : 0;
      const bPercentage = b.total > 0 ? b.wins / b.total : 0;

      if (bPercentage !== aPercentage) {
        return bPercentage - aPercentage;
      }

      return b.wins - a.wins;
    });

    setLeaderboard(rows);
    setLoading(false);
  }

  useEffect(() => {
    // This effect intentionally loads external Supabase data when the sport filter changes.
    // The data-loading function updates component state as part of that async operation.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadLeaderboard();

    // The filter is the only input to this data load; the function is recreated per render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sportFilter]);

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

  function pickOracleMessage(messages: string[]) {
    if (messages.length === 0) {
      return "The numbers have been reviewed. The numbers regret getting involved.";
    }

    // Keep Oracle output deterministic so React renders remain pure.
    return messages[0];
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
      ? [...winningStreakPlayers].sort((a, b) => b.streak - a.streak)[0]
      : null;

    const coldest = losingStreakPlayers.length
      ? [...losingStreakPlayers].sort((a, b) => b.streak - a.streak)[0]
      : null;

    const leader = leaderboard[0];
    const second = leaderboard[1];

    const positivePlayers = leaderboard.filter(
      (player) => player.net_units > 0
    );

    const negativePlayers = leaderboard.filter(
      (player) => player.net_units < 0
    );

    const maxStreak = hottest?.streak ?? 0;
    const maxLosingStreak = coldest?.streak ?? 0;

    const leaderSecondGap = second
      ? leader.net_units - second.net_units
      : Infinity;

    /*
     * PRIORITY 1:
     * Truly extreme losing streaks.
     */
    if (maxLosingStreak >= 6 && coldest) {
      return pickOracleMessage([
        `${coldest.user_name} has lost ${maxLosingStreak} straight. The Oracle recommends a brief vacation from decision-making.`,
        `${coldest.user_name} is ${maxLosingStreak} losses deep. At this point the picks are being generated by a hostile entity.`,
        `${coldest.user_name} has forgotten what winning feels like. The sportsbook remembers.`,
        `${coldest.user_name} has lost ${maxLosingStreak} in a row. Somewhere, a sportsbook executive just felt a disturbance in the force.`,
      ]);
    }

    /*
     * PRIORITY 2:
     * Huge winning streaks.
     */
    if (maxStreak >= 6 && hottest) {
      return pickOracleMessage([
        `${hottest.user_name} is on a ${maxStreak}-game heater. This is usually when the universe begins preparing the invoice.`,
        `${hottest.user_name} has won ${maxStreak} straight. Confidence is now entering dangerous territory.`,
        `${hottest.user_name} is ${maxStreak} deep. Historically, this is where the terrible parlay begins.`,
        `${hottest.user_name} has apparently discovered the cheat code. The Oracle is investigating.`,
      ]);
    }

    /*
     * PRIORITY 3:
     * Extremely close race.
     */
    if (second && Math.abs(leaderSecondGap) < 0.5) {
      return pickOracleMessage([
        `First and second are separated by ${leaderSecondGap.toFixed(2)} units. One bad pick could rewrite the entire leaderboard.`,
        `${leader.user_name} leads ${second.user_name} by less than half a unit. This is no longer a leaderboard. It's a hostage situation.`,
        `${leader.user_name} is barely holding onto first. The margin for error is approximately one questionable Saturday afternoon.`,
        `The top two are essentially tied. The Oracle sees chaos approaching.`,
      ]);
    }

    /*
     * PRIORITY 4:
     * Tight race within one unit.
     */
    if (second && Math.abs(leaderSecondGap) < 1) {
      return pickOracleMessage([
        `The difference between first and second is currently one terrible decision.`,
        `${leader.user_name} leads by just ${leaderSecondGap.toFixed(2)} units. Nobody should be comfortable.`,
        `First place is within striking distance. The next bad pick could rearrange everything.`,
        `${second.user_name} is breathing directly down ${leader.user_name}'s neck. The Oracle recommends refreshing frequently.`,
      ]);
    }

    /*
     * PRIORITY 5:
     * Nobody profitable.
     */
    if (positivePlayers.length === 0 && leaderboard.length >= 2) {
      return pickOracleMessage([
        `Nobody is profitable. The leaderboard has become a crime scene.`,
        `Everyone is down money. Congratulations to whoever is losing the least.`,
        `There are currently zero profitable players. The sportsbook would like to thank everyone for their continued service.`,
        `The entire leaderboard is underwater. Somehow, there are still more bets to be made.`,
      ]);
    }

    /*
     * PRIORITY 6:
     * Most players losing.
     */
    if (
      negativePlayers.length >=
      Math.ceil(leaderboard.length * 0.75)
    ) {
      return pickOracleMessage([
        `Most of the leaderboard is losing money. The sportsbook would like to thank everyone for their continued service.`,
        `Three out of four players are underwater. The house remains emotionally supported.`,
        `The leaderboard is mostly red. Somewhere, a bookmaker is having an excellent day.`,
        `The field is getting crushed. Fortunately, nobody seems ready to stop.`,
      ]);
    }

    /*
     * PRIORITY 7:
     * Leader has a meaningful lead.
     */
    if (leader.net_units >= 5) {
      return pickOracleMessage([
        `${leader.user_name} has opened up a commanding ${leader.net_units.toFixed(2)}-unit lead. This will make the eventual collapse much funnier.`,
        `${leader.user_name} is running away with it at +${leader.net_units.toFixed(2)} units. The Oracle reminds everyone that regression exists.`,
        `${leader.user_name} has built a ${leader.net_units.toFixed(2)}-unit cushion. Please enjoy it responsibly.`,
        `${leader.user_name} is sitting comfortably in first. The Oracle has seen this movie before.`,
      ]);
    }

    /*
     * PRIORITY 8:
     * Leader is on a strong winning streak.
     */
    if (leader.streakType === "W" && leader.streak >= 3) {
      return pickOracleMessage([
        `${leader.user_name} is on a ${leader.streak}-game winning streak. Confidence is now the biggest liability.`,
        `${leader.user_name} has won ${leader.streak} straight and is beginning to believe the picks are skill.`,
        `${leader.user_name} is riding ${leader.streak} consecutive wins. The next bet will be completely reasonable. Probably.`,
        `${leader.user_name} is heating up. The Oracle advises against becoming insufferable.`,
      ]);
    }

    /*
     * PRIORITY 9:
     * Leader is on a losing streak.
     */
    if (leader.streakType === "L" && leader.streak >= 3) {
      return pickOracleMessage([
        `${leader.user_name} has lost ${leader.streak} straight. A bold strategy. Unfortunately, it appears to be the wrong one.`,
        `${leader.user_name} is still in first despite losing ${leader.streak} straight. Everyone else should be concerned.`,
        `${leader.user_name} has hit a ${leader.streak}-game cold streak. Somehow, first place remains theirs.`,
        `The leader is losing. Nobody else has done enough to take advantage. Embarrassing all around.`,
      ]);
    }

    /*
     * PRIORITY 10:
     * One player is clearly the only profitable one.
     */
    if (positivePlayers.length === 1 && leaderboard.length >= 3) {
      const onlyWinner = positivePlayers[0];

      return pickOracleMessage([
        `${onlyWinner.user_name} is the only profitable player. Everyone else is currently donating.`,
        `Only ${onlyWinner.user_name} is above zero. The rest of the leaderboard is financing the experiment.`,
        `${onlyWinner.user_name} has figured out the one trick nobody else has: apparently, winning.`,
        `One profitable player. Several concerned players. This is exactly what the Oracle expected.`,
      ]);
    }

    /*
     * PRIORITY 11:
     * Small leaderboard.
     */
    if (leaderboard.length === 2) {
      return pickOracleMessage([
        `Two players. One leaderboard. Absolutely no room for excuses.`,
        `It's a two-person race. The Oracle has already chosen violence.`,
        `There are only two players here, yet somehow the stakes feel enormous.`,
        `Head-to-head betting has commenced. Friendship is now theoretical.`,
      ]);
    }

    /*
     * PRIORITY 12:
     * Larger leaderboard with no dramatic condition.
     */
    if (leaderboard.length >= 5) {
      return pickOracleMessage([
        `Someone on this leaderboard is about to make a terrible decision. Unfortunately, everyone qualifies.`,
        `There are ${leaderboard.length} players and approximately zero responsible betting decisions.`,
        `The field is large, the confidence is misplaced, and the Oracle remains concerned.`,
        `The leaderboard has spoken. Nobody appears to have learned anything.`,
        `With ${leaderboard.length} players competing, the probability of someone making a ridiculous bet approaches 100%.`,
      ]);
    }

    /*
     * DEFAULT:
     * General Oracle commentary.
     */
    return pickOracleMessage([
      `The numbers have been reviewed. The numbers regret getting involved.`,
      `The Oracle sees potential. Unfortunately, it also sees your betting history.`,
      `The math is inconclusive. The confidence is not.`,
      `Everything looks normal. Which is usually when things go wrong.`,
      `The Oracle has reviewed the evidence and recommends absolutely no additional confidence.`,
      `The leaderboard is alive. Your bankroll may be less so.`,
    ]);
  }

  return (
    <main className="mx-auto max-w-6xl px-2.5 py-5 sm:px-6 sm:py-10">
      <div className="mb-5 sm:mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">
          Leaderboard
        </h1>
        <p className="mt-1.5 text-sm text-gray-600 sm:mt-2 sm:text-base">
          Net units settle the argument. Everyone else is just keeping score.
        </p>
      </div>

      <div className="mb-5 flex gap-2 overflow-x-auto pb-1">
        {[
          ["all", "All"],
          ["nfl", "NFL"],
          ["ncaaf", "NCAAF"],
        ].map(([value, label]) => (
          <button
            key={value}
            onClick={() =>
              setSportFilter(value as "all" | "nfl" | "ncaaf")
            }
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold transition ${
              sportFilter === value
                ? "bg-green-600 text-white"
                : "bg-white text-gray-600 ring-1 ring-gray-200 hover:bg-gray-100"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <p className="text-gray-600">Loading leaderboard...</p>
        </div>
      ) : leaderboard.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <p className="text-gray-600">No completed wagers yet.</p>
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            {/* Header */}
            <div
              className="
                grid
                grid-cols-[32px_minmax(0,1fr)_54px_58px]
                items-center
                border-b
                border-gray-200
                bg-gray-50
                px-2.5
                py-3
                text-[10px]
                font-bold
                uppercase
                tracking-wide
                text-gray-500
                sm:grid-cols-[48px_minmax(0,1fr)_120px_100px_80px_90px]
                sm:px-6
                sm:py-4
                sm:text-sm
                sm:tracking-normal
              "
            >
              <div>#</div>
              <div>Player</div>
              <div className="text-center">Record</div>
              <div className="text-center">Units</div>
              <div className="hidden text-center sm:block">Win %</div>
              <div className="hidden text-center sm:block">Streak</div>
            </div>

            {/* Players */}
            {leaderboard.map((player, index) => {
              const winPercentage =
                player.total > 0
                  ? Math.round((player.wins / player.total) * 100)
                  : 0;

              const isCurrentUser = player.user_id === currentUserId;
              const isFirst = index === 0;
              const isSecond = index === 1;
              const isThird = index === 2;

              return (
                <div
                  key={player.user_id}
                  className={`
                    grid
                    grid-cols-[32px_minmax(0,1fr)_54px_58px]
                    items-center
                    border-b
                    px-2.5
                    py-3.5
                    transition-colors
                    last:border-b-0
                    sm:grid-cols-[48px_minmax(0,1fr)_120px_100px_80px_90px]
                    sm:px-6
                    sm:py-4
                    ${
                      isCurrentUser
                        ? "border-green-200 border-l-4 bg-green-50 pl-1.5 sm:pl-5"
                        : "border-gray-100"
                    }
                  `}
                >
                  {/* Rank */}
                  <div
                    className={`
                      text-sm
                      font-extrabold
                      sm:text-base
                      ${
                        isCurrentUser
                          ? "text-green-700"
                          : isFirst
                            ? "text-gray-900"
                            : isSecond
                              ? "text-gray-600"
                              : isThird
                                ? "text-gray-500"
                                : "text-gray-400"
                      }
                    `}
                  >
                    {isFirst
                      ? "🥇"
                      : isSecond
                        ? "🥈"
                        : isThird
                          ? "🥉"
                          : index + 1}
                  </div>

                  {/* Player */}
                  <div className="min-w-0 pr-1">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span
                        className={`
                          block
                          min-w-0
                          truncate
                          text-[13px]
                          font-bold
                          sm:text-base
                          ${
                            isCurrentUser
                              ? "text-green-900"
                              : "text-gray-900"
                          }
                        `}
                      >
                        {player.user_name}
                      </span>

                      {isCurrentUser ? (
                        <span className="shrink-0 rounded-full bg-green-600 px-1.5 py-0.5 text-[8px] font-extrabold uppercase tracking-wide text-white sm:px-2 sm:text-[9px]">
                          You
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="text-center text-xs font-bold text-gray-700 sm:text-base">
                    {player.wins}–{player.losses}–{player.pushes}
                  </div>

                  {/* Units */}
                  <div
                    className={`
                      text-center
                      text-xs
                      font-extrabold
                      sm:text-base
                      ${
                        player.net_units > 0
                          ? "text-green-600"
                          : player.net_units < 0
                            ? "text-red-600"
                            : "text-gray-900"
                      }
                    `}
                  >
                    {player.net_units > 0 ? "+" : ""}
                    {player.net_units.toFixed(2)}u
                  </div>

                  <div className="hidden text-center text-xs font-bold text-gray-900 sm:block">
                    {winPercentage}%
                  </div>

                  <div
                    className={`
                      hidden text-center sm:block
                      text-[10px]
                      font-extrabold
                      sm:text-sm
                      ${
                        player.streakType === "W" && player.streak >= 3
                          ? "text-orange-600"
                          : player.streakType === "L" && player.streak >= 3
                            ? "text-blue-500"
                            : "text-gray-600"
                      }
                    `}
                  >
                    {getStreakDisplay(player)}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Oracle */}
          <div className="mt-7 border-t border-gray-200 pt-5 text-center sm:mt-8 sm:pt-6">
            <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-gray-400 sm:text-[10px]">
              The Oracle Has Spoken
            </p>

            <div className="mx-auto mt-2 max-w-2xl px-2">
              <p className="text-xs italic leading-5 text-gray-500 sm:text-sm sm:leading-6">
                &ldquo;{getOracle()}&rdquo;
              </p>
            </div>
          </div>
        </>
      )}
    </main>
  );
}