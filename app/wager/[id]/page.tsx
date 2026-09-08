"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
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

type BetOption = {
  label: string;
  pick: string;
  betType: string;
  line: number | null;
  odds: number | null;
};

export default function WagerPage() {
  const params = useParams();
  const gameId = params.id as string;

  const [game, setGame] = useState<Game | null>(null);
  const [selectedBet, setSelectedBet] = useState<BetOption | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function loadGame() {
      const { data, error } = await supabase
        .from("games")
        .select(
          "id, away_team, home_team, starts_at, spread, spread_home, spread_odds_away, spread_odds_home, total, total_odds_over, total_odds_under, moneyline_away, moneyline_home"
        )
        .eq("id", gameId)
        .single();

      if (error) {
        console.error(error);
        setMessage("Unable to load this game.");
      } else {
        setGame(data);
      }

      setLoading(false);
    }

    if (gameId) {
      loadGame();
    }
  }, [gameId]);

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

  function selectBet(option: BetOption) {
    setSelectedBet(option);
    setMessage("");
  }

  async function placeWager() {
    if (!selectedBet || !game) {
      return;
    }

    setSaving(true);
    setMessage("");

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setMessage("Please sign in before placing a wager.");
      setSaving(false);
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle();

    const { error } = await supabase.from("picks").insert({
      game_id: game.id,
      user_id: user.id,
      user_name: profile?.display_name || "Player",
      pick: selectedBet.pick,
      bet_type: selectedBet.betType,
      line: selectedBet.line,
      odds: selectedBet.odds,
      units: 1,
      result: "pending",
    });

    if (error) {
      console.error(error);
      setMessage("Unable to place wager. Please try again.");
      setSaving(false);
      return;
    }

    window.location.href = "/wagers";
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-50 px-6 py-8">
        <div className="mx-auto max-w-3xl">
          <div className="rounded-xl bg-white p-6 shadow-sm">
            <p className="text-gray-500">
              Loading game...
            </p>
          </div>
        </div>
      </main>
    );
  }

  if (!game) {
    return (
      <main className="min-h-screen bg-gray-50 px-6 py-8">
        <div className="mx-auto max-w-3xl">
          <div className="rounded-xl bg-white p-6 shadow-sm">
            <p className="text-gray-500">
              {message || "Game not found."}
            </p>
          </div>
        </div>
      </main>
    );
  }

  const spreadOptions: BetOption[] = [
    {
      label: `${game.away_team} ${formatLine(game.spread)}`,
      pick: game.away_team,
      betType: "Spread",
      line: game.spread,
      odds: game.spread_odds_away,
    },
    {
      label: `${game.home_team} ${formatLine(game.spread_home)}`,
      pick: game.home_team,
      betType: "Spread",
      line: game.spread_home,
      odds: game.spread_odds_home,
    },
  ];

  const moneylineOptions: BetOption[] = [
    {
      label: game.away_team,
      pick: game.away_team,
      betType: "Moneyline",
      line: null,
      odds: game.moneyline_away,
    },
    {
      label: game.home_team,
      pick: game.home_team,
      betType: "Moneyline",
      line: null,
      odds: game.moneyline_home,
    },
  ];

  const totalOptions: BetOption[] = [
    {
      label: `Over ${game.total ?? ""}`,
      pick: "Over",
      betType: "Total",
      line: game.total,
      odds: game.total_odds_over,
    },
    {
      label: `Under ${game.total ?? ""}`,
      pick: "Under",
      betType: "Total",
      line: game.total,
      odds: game.total_odds_under,
    },
  ];

  function BetButton({ option }: { option: BetOption }) {
    const selected =
      selectedBet?.betType === option.betType &&
      selectedBet?.pick === option.pick &&
      selectedBet?.line === option.line;

    return (
      <button
        onClick={() => selectBet(option)}
        className={`w-full rounded-lg border px-4 py-3 text-left transition ${
          selected
            ? "border-gray-900 bg-gray-900 text-white"
            : "border-gray-200 bg-white text-gray-900 hover:border-gray-400"
        }`}
      >
        <div className="flex items-center justify-between">
          <span className="font-semibold">
            {option.label}
          </span>

          {option.odds !== null && (
            <span className="font-semibold">
              {formatOdds(option.odds)}
            </span>
          )}
        </div>
      </button>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 px-6 py-8">
      <div className="mx-auto max-w-3xl">
        <button
          onClick={() => window.history.back()}
          className="mb-6 text-sm font-semibold text-gray-500 hover:text-gray-900"
        >
          ← Back
        </button>

        <div className="rounded-xl bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-bold text-gray-900">
            {game.away_team} vs. {game.home_team}
          </h1>

          <p className="mt-1 text-sm text-gray-500">
            {formatDate(game.starts_at)}
          </p>

          <div className="mt-8">
            <h2 className="text-lg font-bold text-gray-900">
              Spread
            </h2>

            <div className="mt-3 space-y-2">
              {spreadOptions.map((option) => (
                <BetButton
                  key={`${option.betType}-${option.pick}`}
                  option={option}
                />
              ))}
            </div>
          </div>

          <div className="mt-8">
            <h2 className="text-lg font-bold text-gray-900">
              Total
            </h2>

            <div className="mt-3 space-y-2">
              {totalOptions.map((option) => (
                <BetButton
                  key={`${option.betType}-${option.pick}`}
                  option={option}
                />
              ))}
            </div>
          </div>

          <div className="mt-8">
            <h2 className="text-lg font-bold text-gray-900">
              Moneyline
            </h2>

            <div className="mt-3 space-y-2">
              {moneylineOptions.map((option) => (
                <BetButton
                  key={`${option.betType}-${option.pick}`}
                  option={option}
                />
              ))}
            </div>
          </div>

          <div className="mt-8 border-t border-gray-100 pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">
                  Wager Amount
                </p>

                <p className="text-xl font-bold text-gray-900">
                  1 Unit
                </p>
              </div>

              <button
                onClick={placeWager}
                disabled={!selectedBet || saving}
                className="rounded-lg bg-gray-900 px-6 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                {saving ? "Placing..." : "Confirm Wager"}
              </button>
            </div>

            {selectedBet && (
              <div className="mt-4 rounded-lg bg-gray-100 p-4 text-sm text-gray-700">
                <span className="font-semibold">
                  Your pick:
                </span>{" "}
                {selectedBet.pick} • {selectedBet.betType}
                {selectedBet.line !== null &&
                  ` • ${formatLine(selectedBet.line)}`}
                {selectedBet.odds !== null &&
                  ` • ${formatOdds(selectedBet.odds)}`}
              </div>
            )}

            {message && (
              <div className="mt-4 rounded-lg bg-gray-100 p-4 text-sm text-gray-700">
                {message}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}