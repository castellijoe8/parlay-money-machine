type Matchup = { away_team: string | null; home_team: string | null };

export function wagerMatchup(game: Matchup | null | undefined) {
  const away = game?.away_team?.trim();
  const home = game?.home_team?.trim();
  if (!away && !home) return "Matchup unavailable";
  return `${away || "Away team unavailable"} vs. ${home || "Home team unavailable"}`;
}
