export type FinalGame = {
  id: string;
  sport: string | null;
  away_team: string;
  home_team: string;
  starts_at: string;
  status: string;
  home_score: number | null;
  away_score: number | null;
};

export type TeamForm = {
  games: FinalGame[];
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  latestDate: string | null;
};

export type EdgeNugget = {
  id: string;
  gameId: string;
  away: string;
  home: string;
  category: string;
  headline: string;
  detail: string;
  reason: string;
  freshness: string;
  score: number;
};

export function isFinalGame(game: FinalGame): game is FinalGame & { home_score: number; away_score: number } {
  return game.status === "final" && game.home_score !== null && game.away_score !== null;
}

export function teamForm(history: FinalGame[], team: string, sport?: string | null, count = 10): TeamForm {
  const games = history
    .filter(isFinalGame)
    .filter((game) => (!sport || game.sport === sport) && (game.home_team === team || game.away_team === team))
    .sort((a, b) => Date.parse(b.starts_at) - Date.parse(a.starts_at))
    .slice(0, count);
  let wins = 0;
  let pointsFor = 0;
  let pointsAgainst = 0;
  for (const game of games) {
    const isHome = game.home_team === team;
    const scored = isHome ? game.home_score : game.away_score;
    const allowed = isHome ? game.away_score : game.home_score;
    pointsFor += scored;
    pointsAgainst += allowed;
    if (scored > allowed) wins += 1;
  }
  return {
    games,
    wins,
    losses: games.length - wins,
    pointsFor: games.length ? pointsFor / games.length : 0,
    pointsAgainst: games.length ? pointsAgainst / games.length : 0,
    latestDate: games[0]?.starts_at ?? null,
  };
}

export function teamStreak(form: TeamForm, team: string): { result: "W" | "L"; count: number } | null {
  if (!form.games.length) return null;
  let count = 0;
  let result: "W" | "L" | null = null;
  for (const game of form.games) {
    const isHome = game.home_team === team;
    const won = (isHome ? game.home_score! : game.away_score!) > (isHome ? game.away_score! : game.home_score!);
    const next = won ? "W" : "L";
    if (result && result !== next) break;
    result = next;
    count += 1;
  }
  return result ? { result, count } : null;
}

export function recentGameNuggets(today: FinalGame[], history: FinalGame[]): EdgeNugget[] {
  const candidates: EdgeNugget[] = [];
  const completed = history.filter(isFinalGame);
  for (const game of today) {
    const away = teamForm(completed, game.away_team, game.sport, 10);
    const home = teamForm(completed, game.home_team, game.sport, 10);
    if (away.games.length >= 5 && home.games.length >= 5) {
      const winGap = Math.abs(away.wins / away.games.length - home.wins / home.games.length);
      const scoringGap = Math.abs(away.pointsFor - home.pointsFor);
      const defenseGap = Math.abs(away.pointsAgainst - home.pointsAgainst);
      if (winGap >= 0.2 || scoringGap >= 8 || defenseGap >= 8) {
        const stronger = away.wins / away.games.length >= home.wins / home.games.length ? away : home;
        const strongerTeam = stronger === away ? game.away_team : game.home_team;
        const score = Math.max(winGap * 100, scoringGap * 3, defenseGap * 3) + Math.min(10, Math.min(away.games.length, home.games.length));
        candidates.push({
          id: `${game.id}-form`, gameId: game.id, away: game.away_team, home: game.home_team,
          category: "RECENT FORM", headline: `${strongerTeam} bring the stronger recent record`,
          detail: `Last ${stronger.games.length}: ${stronger.wins}–${stronger.losses}; ${stronger.pointsFor.toFixed(1)} points scored and ${stronger.pointsAgainst.toFixed(1)} allowed per game.`,
          reason: `The other side is ${stronger === away ? `${home.wins}–${home.losses}` : `${away.wins}–${away.losses}`} across its last ${stronger === away ? home.games.length : away.games.length}. This is a historical comparison, not a prediction.`,
          freshness: latestDate([away.latestDate, home.latestDate]), score,
        });
      }
    }

    const meetings = completed
      .filter((past) => past.sport === game.sport && ((past.home_team === game.home_team && past.away_team === game.away_team) || (past.home_team === game.away_team && past.away_team === game.home_team)))
      .sort((a, b) => Date.parse(b.starts_at) - Date.parse(a.starts_at))
      .slice(0, 5);
    if (meetings.length >= 2) {
      const homeWins = meetings.filter((past) => (past.home_team === game.home_team ? past.home_score! > past.away_score! : past.away_score! > past.home_score!)).length;
      if (homeWins === 0 || homeWins === meetings.length || Math.abs(homeWins - meetings.length / 2) >= 1) {
        const latest = meetings[0].starts_at;
        candidates.push({
          id: `${game.id}-h2h`, gameId: game.id, away: game.away_team, home: game.home_team,
          category: "HEAD TO HEAD", headline: `${game.home_team} have won ${homeWins} of the last ${meetings.length} meetings`,
          detail: `The most recent meeting was ${formatMeeting(meetings[0], game.home_team)}.`,
          reason: `These teams have met ${meetings.length} times in the available final-score history. Past results do not predict the next game.`,
          freshness: new Date(latest).toISOString(), score: 30 + meetings.length * 2 + Math.abs(homeWins - meetings.length / 2),
        });
      }
    }
  }
  const sorted = candidates.sort((a, b) => b.score - a.score);
  const counts = new Map<string, number>();
  return sorted.filter((item) => {
    const count = counts.get(item.gameId) ?? 0;
    if (count >= 2) return false;
    counts.set(item.gameId, count + 1);
    return true;
  }).slice(0, 6);
}

function latestDate(dates: (string | null)[]): string {
  const valid = dates.filter((date): date is string => Boolean(date));
  return valid.sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? new Date().toISOString();
}

function formatMeeting(game: FinalGame, homeTeam: string): string {
  const homeScore = game.home_score!;
  const awayScore = game.away_score!;
  const homeWon = game.home_team === homeTeam ? homeScore > awayScore : awayScore > homeScore;
  return `${homeWon ? homeTeam : (game.home_team === homeTeam ? game.away_team : game.home_team)} ${Math.max(homeScore, awayScore)}–${Math.min(homeScore, awayScore)} on ${new Date(game.starts_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
}
