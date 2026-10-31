"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type SharedLeg = { id: string; sport: string; market: "Spread" | "Total" | "Moneyline"; selection: string; line: number | null; american_odds: number; game: { id: string; sport: "nfl" | "ncaaf"; away_team: string; home_team: string; starts_at: string; status: string; home_score: number | null; away_score: number | null; spread: number | null; spread_home: number | null; spread_odds_away: number | null; spread_odds_home: number | null; total: number | null; total_odds_over: number | null; total_odds_under: number | null; moneyline_away: number | null; moneyline_home: number | null } | null };
export default function SharedParlayPage() {
  const { token } = useParams<{ token: string }>(); const router = useRouter();
  const [legs, setLegs] = useState<SharedLeg[]>([]); const [combinedOdds, setCombinedOdds] = useState<number | null>(null); const [error, setError] = useState("");
  useEffect(() => { void fetch(`/api/parlays/share/${token}`).then(async (res) => { const data = await res.json(); if (!res.ok) throw new Error(data.error); setLegs(data.legs); setCombinedOdds(data.combinedAmericanOdds); }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load shared parlay.")); }, [token]);
  function copyToSlip() {
    const selections = legs.filter((leg) => leg.game && leg.game.status === "scheduled" && Date.parse(leg.game.starts_at) > Date.now()).map((leg) => {
      const game = leg.game!; let odds: number | null = null;
      if (leg.market === "Spread") odds = leg.selection === game.home_team ? game.spread_odds_home : game.spread_odds_away;
      else if (leg.market === "Total") odds = leg.selection === "Over" ? game.total_odds_over : game.total_odds_under;
      else odds = leg.selection === game.home_team ? game.moneyline_home : game.moneyline_away;
      const line = leg.market === "Spread" ? (leg.selection === game.home_team ? game.spread_home : game.spread) : leg.market === "Total" ? game.total : null;
      return { game, pick: leg.selection, betType: leg.market, line, odds };
    }).filter((selection) => selection.odds !== null);
    if (selections.length < 2) { setError("Fewer than two shared selections still have current, upcoming prices."); return; }
    localStorage.setItem("parlay-money-machine-selections-v1", JSON.stringify(selections)); router.push("/");
  }
  return <main className="min-h-screen bg-gray-50 px-4 py-8"><section className="mx-auto max-w-2xl rounded-2xl bg-white p-5 shadow-sm sm:p-8"><p className="text-xs font-black uppercase tracking-widest text-green-700">Shared parlay template</p><h1 className="mt-2 text-2xl font-black">{legs.length} selections · {combinedOdds && `${combinedOdds > 0 ? "+" : ""}${combinedOdds} at placement`}</h1><p className="mt-2 text-sm text-gray-500">This is a shared template, not a placed wager. Copying it uses current prices and does not include the original stake.</p>{error && <p role="alert" className="mt-4 text-sm font-semibold text-red-700">{error}</p>}<div className="mt-5 space-y-3">{legs.map((leg) => <article key={leg.id} className="rounded-xl border p-3"><p className="font-bold">{leg.selection} {leg.market === "Moneyline" ? "ML" : leg.line ?? ""} · {leg.american_odds > 0 ? "+" : ""}{leg.american_odds}</p><p className="mt-1 text-xs text-gray-500">{leg.sport.toUpperCase()} · {leg.game?.away_team} vs. {leg.game?.home_team}</p></article>)}</div><div className="mt-5 flex flex-wrap gap-2"><button onClick={copyToSlip} className="rounded-xl bg-green-700 px-4 py-3 text-sm font-extrabold text-white">Copy selections at current odds</button><Link href="/" className="rounded-xl border px-4 py-3 text-sm font-bold">Back to sportsbook</Link></div></section></main>;
}
