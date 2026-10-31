export type FinalGame = {
  id: string;
  sport: string | null;
  away_team: string;
  home_team: string;
  starts_at: string;
  status: string;
  home_score: number | null;
  away_score: number | null;
  updated_at?: string;
  spread?: number | null;
  spread_home?: number | null;
  total?: number | null;
  moneyline_away?: number | null;
  moneyline_home?: number | null;
};

export type OddsOutcome = { name: string; point?: number; price?: number };
export type OddsSnapshot = {
  id: string | number;
  game_id: string;
  sport: string;
  sportsbook: string;
  market: "spreads" | "totals" | "h2h";
  observed_at: string;
  provider_updated_at: string | null;
  outcomes: OddsOutcome[];
  is_earliest?: boolean;
  observation_count?: number;
};

export type TeamForm = {
  games: FinalGame[];
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
  pointDifferential: number;
  latestDate: string | null;
};

export type EdgeNugget = {
  id: string;
  gameId: string;
  away: string;
  home: string;
  sport: string | null;
  startsAt: string;
  category: "ATS TREND" | "OVER / UNDER" | "LINE MOVEMENT" | "RECENT FORM" | "HEAD TO HEAD";
  headline: string;
  detail: string;
  reason: string;
  freshness: string;
  score: number;
  source?: string;
};

export type BookLine = { sportsbook: string; observedAt: string; outcomes: OddsOutcome[]; points: number[]; prices: number[] };
export type LineRecord = { covers: number; misses: number; pushes: number; sampleSize: number; games: FinalGame[] };

const SPORTSBOOK_LABELS: Record<string, string> = {
  draftkings: "DraftKings", fanduel: "FanDuel", betmgm: "BetMGM", caesars: "Caesars",
  pointsbetus: "PointsBet", betrivers: "BetRivers", fanatics: "Fanatics",
};

export function sportsbookLabel(key: string) {
  return SPORTSBOOK_LABELS[key] ?? key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

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
  let ties = 0;
  for (const game of games) {
    const isHome = game.home_team === team;
    const scored = isHome ? game.home_score : game.away_score;
    const allowed = isHome ? game.away_score : game.home_score;
    pointsFor += scored;
    pointsAgainst += allowed;
    if (scored > allowed) wins += 1;
    else if (scored === allowed) ties += 1;
  }
  const averageFor = games.length ? pointsFor / games.length : 0;
  const averageAgainst = games.length ? pointsAgainst / games.length : 0;
  return {
    games, wins, losses: games.length - wins - ties, ties, pointsFor: averageFor,
    pointsAgainst: averageAgainst, pointDifferential: averageFor - averageAgainst,
    latestDate: games[0]?.starts_at ?? null,
  };
}

export function teamStreak(form: TeamForm, team: string): { result: "W" | "L" | "T"; count: number } | null {
  if (!form.games.length) return null;
  let count = 0;
  let result: "W" | "L" | "T" | null = null;
  for (const game of form.games) {
    const isHome = game.home_team === team;
    const scored = isHome ? game.home_score! : game.away_score!;
    const allowed = isHome ? game.away_score! : game.home_score!;
    const next = scored > allowed ? "W" : scored < allowed ? "L" : "T";
    if (result && result !== next) break;
    result = next;
    count += 1;
  }
  return result ? { result, count } : null;
}

export function indexOddsSnapshots(snapshots: OddsSnapshot[]) {
  const index = new Map<string, OddsSnapshot[]>();
  for (const snapshot of snapshots) {
    const key = `${snapshot.game_id}:${snapshot.market}`;
    const current = index.get(key) ?? [];
    current.push(snapshot);
    index.set(key, current);
  }
  for (const current of index.values()) current.sort((a, b) => Date.parse(a.observed_at) - Date.parse(b.observed_at));
  return index;
}

export function latestPregameLines(game: FinalGame, market: OddsSnapshot["market"], index: Map<string, OddsSnapshot[]>): BookLine[] {
  const snapshots = index.get(`${game.id}:${market}`) ?? [];
  const kickoff = Date.parse(game.starts_at);
  const byBook = new Map<string, OddsSnapshot>();
  for (const snapshot of snapshots) {
    if (Date.parse(snapshot.observed_at) > kickoff) continue;
    const current = byBook.get(snapshot.sportsbook);
    if (!current || Date.parse(snapshot.observed_at) > Date.parse(current.observed_at)) byBook.set(snapshot.sportsbook, snapshot);
  }
  return [...byBook.entries()].map(([sportsbook, snapshot]) => {
    const outcomes = snapshot.outcomes ?? [];
    const outcomeNames = market === "spreads" ? [game.away_team, game.home_team] : market === "totals" ? ["Over", "Under"] : [game.away_team, game.home_team];
    const selected = outcomes.filter((outcome) => outcomeNames.includes(outcome.name));
    return {
      sportsbook,
      observedAt: snapshot.observed_at,
      outcomes: selected,
      points: selected.flatMap((outcome) => typeof outcome.point === "number" ? [outcome.point] : []),
      prices: selected.flatMap((outcome) => typeof outcome.price === "number" ? [outcome.price] : []),
    };
  }).filter((line) => market === "h2h" ? line.prices.length > 0 : line.points.length > 0);
}

function median(values: number[]) {
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
}

function lineFromBooks(lines: BookLine[], game: FinalGame, market: "spreads" | "totals", team?: string) {
  const values = lines.flatMap((line) => {
    const point = line.outcomes.find((outcome) => outcome.name === (market === "totals" ? "Over" : team))?.point;
    return typeof point === "number" ? [point] : [];
  });
  return values.length ? median(values) : null;
}

export function historicalLine(game: FinalGame, market: "spreads" | "totals", index: Map<string, OddsSnapshot[]>, team?: string) {
  const lines = latestPregameLines(game, market, index);
  return lineFromBooks(lines, game, market, team);
}

export function atsRecord(history: FinalGame[], team: string, sport: string | null, index: Map<string, OddsSnapshot[]>, count = 8, venue?: "home" | "away"): LineRecord {
  const recent = history.filter(isFinalGame).filter((game) => game.sport === sport && (venue === "home" ? game.home_team === team : venue === "away" ? game.away_team === team : game.home_team === team || game.away_team === team)).sort((a, b) => Date.parse(b.starts_at) - Date.parse(a.starts_at));
  const games: FinalGame[] = [];
  let covers = 0;
  let misses = 0;
  let pushes = 0;
  for (const game of recent) {
    const line = historicalLine(game, "spreads", index, team);
    if (line === null) continue;
    const scoreMargin = game.home_team === team ? game.home_score! - game.away_score! : game.away_score! - game.home_score!;
    const adjusted = scoreMargin + line;
    games.push(game);
    if (adjusted > 0) covers += 1;
    else if (adjusted < 0) misses += 1;
    else pushes += 1;
    if (games.length >= count) break;
  }
  return { covers, misses, pushes, sampleSize: games.length, games };
}

export function totalsRecord(history: FinalGame[], team: string, sport: string | null, index: Map<string, OddsSnapshot[]>, count = 8): LineRecord {
  const recent = history.filter(isFinalGame).filter((game) => game.sport === sport && (game.home_team === team || game.away_team === team)).sort((a, b) => Date.parse(b.starts_at) - Date.parse(a.starts_at));
  const games: FinalGame[] = [];
  let overs = 0;
  let unders = 0;
  let pushes = 0;
  for (const game of recent) {
    const line = historicalLine(game, "totals", index);
    if (line === null) continue;
    const combined = game.home_score! + game.away_score!;
    games.push(game);
    if (combined > line) overs += 1;
    else if (combined < line) unders += 1;
    else pushes += 1;
    if (games.length >= count) break;
  }
  return { covers: overs, misses: unders, pushes, sampleSize: games.length, games };
}

function freshest(games: FinalGame[], snapshots: OddsSnapshot[]) {
  const dates = [...games.map((game) => game.updated_at ?? game.starts_at), ...snapshots.map((snapshot) => snapshot.observed_at)].map(Date.parse).filter(Number.isFinite);
  return dates.length ? new Date(Math.max(...dates)).toISOString() : new Date().toISOString();
}

export function buildWeeklyNuggets(upcoming: FinalGame[], history: FinalGame[], snapshots: OddsSnapshot[]): EdgeNugget[] {
  const index = indexOddsSnapshots(snapshots);
  const candidates: EdgeNugget[] = [];
  const completed = history.filter(isFinalGame);

  for (const game of upcoming.filter((candidate) => Date.parse(candidate.starts_at) > Date.now() && candidate.status === "scheduled")) {
    const awayForm = teamForm(completed, game.away_team, game.sport, 5);
    const homeForm = teamForm(completed, game.home_team, game.sport, 5);
    if (awayForm.games.length >= 4 && homeForm.games.length >= 4) {
      const gap = Math.abs(awayForm.pointDifferential - homeForm.pointDifferential);
      const awayWinPct = (awayForm.wins + awayForm.ties / 2) / awayForm.games.length;
      const homeWinPct = (homeForm.wins + homeForm.ties / 2) / homeForm.games.length;
      const winGap = Math.abs(awayWinPct - homeWinPct);
      if (gap >= 8 || winGap >= 0.4) {
        const leader = awayForm.pointDifferential >= homeForm.pointDifferential ? awayForm : homeForm;
        const leaderTeam = leader === awayForm ? game.away_team : game.home_team;
        const other = leader === awayForm ? homeForm : awayForm;
        candidates.push({
          id: `${game.id}-form`, gameId: game.id, away: game.away_team, home: game.home_team, sport: game.sport, startsAt: game.starts_at,
          category: "RECENT FORM", headline: `${leaderTeam} have the stronger five-game point differential`,
          detail: `${leaderTeam}: ${leader.wins}–${leader.losses}${leader.ties ? `–${leader.ties}` : ""}, ${signed(leader.pointDifferential)} points per game. ${leader === awayForm ? game.home_team : game.away_team}: ${other.wins}–${other.losses}${other.ties ? `–${other.ties}` : ""}, ${signed(other.pointDifferential)} per game.`,
          reason: "This comparison uses completed scores from each team’s most recent five games; it describes recent form and does not predict the matchup.",
          freshness: freshest([...leader.games, ...other.games], []), score: 32 + gap + winGap * 20,
        });
      }
    }

    const currentSpread = latestPregameLines(game, "spreads", index);
    for (const team of [game.away_team, game.home_team]) {
      const atsOptions = [
        { venue: undefined as "home" | "away" | undefined, label: "" },
        { venue: "home" as const, label: " at home" },
        { venue: "away" as const, label: " on the road" },
      ].map((option) => ({ ...option, record: atsRecord(completed, team, game.sport, index, 8, option.venue) }))
        .filter(({ record }) => {
          const decisions = record.covers + record.misses;
          return record.sampleSize >= 4 && decisions >= 4 && (record.covers / decisions >= 0.75 || record.misses / decisions >= 0.75);
        })
        .sort((a, b) => (b.record.sampleSize ? Math.max(b.record.covers, b.record.misses) / (b.record.covers + b.record.misses) : 0) - (a.record.sampleSize ? Math.max(a.record.covers, a.record.misses) / (a.record.covers + a.record.misses) : 0) || b.record.sampleSize - a.record.sampleSize);
      const atsTrend = atsOptions[0];
      if (atsTrend) {
        const { record, label } = atsTrend;
        const nonPushes = record.covers + record.misses;
        const dominant = record.covers > record.misses ? "covered" : "failed to cover";
        const currentLine = historicalLine(game, "spreads", index, team);
        const currentLineLabel = currentLine === null ? "Current spread unavailable" : `Current observed spread: ${team} ${currentLine > 0 ? "+" : ""}${currentLine}`;
        const sourceCount = new Set(currentSpread.map((line) => line.sportsbook)).size;
        const dates = record.games.map((past) => Date.parse(past.starts_at)).filter(Number.isFinite);
        const dateRange = dates.length ? ` From ${new Date(Math.min(...dates)).toLocaleDateString(undefined, { month: "short", day: "numeric" })} to ${new Date(Math.max(...dates)).toLocaleDateString(undefined, { month: "short", day: "numeric" })}.` : "";
        candidates.push({
          id: `${game.id}-ats-${team}`, gameId: game.id, away: game.away_team, home: game.home_team, sport: game.sport, startsAt: game.starts_at,
          category: "ATS TREND", headline: `${team}${label} ${dominant} in ${record.covers} of ${nonPushes} lined games`,
          detail: `${record.covers} covers · ${record.misses} non-covers${record.pushes ? ` · ${record.pushes} pushes` : ""} across ${record.sampleSize} games with recorded pregame spreads.${dateRange}`,
          reason: `${currentLineLabel}. Historical ATS uses the latest recorded pregame line per available sportsbook${sourceCount >= 3 ? `, with a ${sourceCount}-book median` : ""}; it is not necessarily the closing line.`,
          freshness: freshest(record.games, snapshots.filter((snapshot) => record.games.some((past) => past.id === snapshot.game_id))),
          score: 45 + Math.max(record.covers, record.misses) * 3 + Math.abs(record.covers - record.misses) + (label ? 2 : 0),
          source: sourceCount >= 3 ? `${sourceCount}-book current median` : undefined,
        });
      }

      const totalRecord = totalsRecord(completed, team, game.sport, index, 8);
      const totalDecisions = totalRecord.covers + totalRecord.misses;
      if (totalRecord.sampleSize >= 4 && totalDecisions >= 4 && (totalRecord.covers / totalDecisions >= 0.75 || totalRecord.misses / totalDecisions >= 0.75)) {
        const direction = totalRecord.covers > totalRecord.misses ? "over" : "under";
        const currentTotal = latestPregameLines(game, "totals", index);
        const total = lineFromBooks(currentTotal, game, "totals");
        const currentLabel = total === null ? "Current total unavailable" : `Current observed total: ${total}`;
        candidates.push({
          id: `${game.id}-ou-${team}`, gameId: game.id, away: game.away_team, home: game.home_team, sport: game.sport, startsAt: game.starts_at,
          category: "OVER / UNDER", headline: `${team} games went ${direction} in ${Math.max(totalRecord.covers, totalRecord.misses)} of ${totalDecisions} lined results`,
          detail: `${totalRecord.covers} overs · ${totalRecord.misses} unders${totalRecord.pushes ? ` · ${totalRecord.pushes} pushes` : ""} across the last ${totalRecord.sampleSize} games with recorded totals.`,
          reason: `${currentLabel}. Historical results use recorded pregame totals, not a claimed closing line.`,
          freshness: freshest(totalRecord.games, snapshots.filter((snapshot) => totalRecord.games.some((past) => past.id === snapshot.game_id))),
          score: 40 + Math.max(totalRecord.covers, totalRecord.misses) * 3 + Math.abs(totalRecord.covers - totalRecord.misses),
          source: currentTotal.length >= 3 ? `${currentTotal.length}-book current median` : undefined,
        });
      }
    }

    const movement = biggestMovement(game, index);
    if (movement) {
      candidates.push({
        id: `${game.id}-move-${movement.market}`, gameId: game.id, away: game.away_team, home: game.home_team, sport: game.sport, startsAt: game.starts_at,
        category: "LINE MOVEMENT", headline: `${movement.marketLabel} moved ${movement.magnitude} ${movement.unit} at ${sportsbookLabel(movement.sportsbook)}`,
        detail: `${movement.earliestLabel} ${movement.from} → latest recorded ${movement.to}.`,
        reason: `Movement is measured within the same sportsbook from this system’s earliest captured observation. It is not necessarily the true opening line and does not imply why the market moved.`,
        freshness: movement.latestAt, score: 55 + movement.magnitude * 5,
        source: sportsbookLabel(movement.sportsbook),
      });
    }

    const meetings = completed.filter((past) => past.sport === game.sport && ((past.home_team === game.home_team && past.away_team === game.away_team) || (past.home_team === game.away_team && past.away_team === game.home_team))).sort((a, b) => Date.parse(b.starts_at) - Date.parse(a.starts_at)).slice(0, 5);
    if (meetings.length >= 2) {
      const homeWins = meetings.filter((past) => (past.home_team === game.home_team ? past.home_score! > past.away_score! : past.away_score! > past.home_score!)).length;
      if (homeWins === 0 || homeWins === meetings.length) {
        candidates.push({
          id: `${game.id}-h2h`, gameId: game.id, away: game.away_team, home: game.home_team, sport: game.sport, startsAt: game.starts_at,
          category: "HEAD TO HEAD", headline: `${game.home_team} have won ${homeWins} of the last ${meetings.length} meetings`,
          detail: `Most recent meeting: ${formatMeeting(meetings[0])}.`,
          reason: "This reflects available final-score history only; past results are not predictive.",
          freshness: meetings[0].starts_at, score: 28 + meetings.length * 2 + Math.abs(homeWins - meetings.length / 2),
        });
      }
    }
  }

  const byCategoryGame = new Set<string>();
  const gameCounts = new Map<string, number>();
  const ranked = candidates.map((item) => {
    const ageDays = Math.max(0, (Date.now() - Date.parse(item.freshness)) / 86_400_000);
    const oddsInsight = ["ATS TREND", "OVER / UNDER", "LINE MOVEMENT"].includes(item.category);
    const staleOddsPenalty = oddsInsight && ageDays > 1 ? Math.min(24, Math.floor(ageDays - 1) * 3) : 0;
    return { ...item, score: item.score - Math.min(12, Math.floor(ageDays / 3)) - staleOddsPenalty };
  }).sort((a, b) => b.score - a.score);
  const selected: EdgeNugget[] = [];
  const addCandidate = (item: EdgeNugget) => {
    const categoryKey = `${item.gameId}:${item.category}`;
    const count = gameCounts.get(item.gameId) ?? 0;
    if (count >= 2 || byCategoryGame.has(categoryKey)) return;
    byCategoryGame.add(categoryKey);
    gameCounts.set(item.gameId, count + 1);
    selected.push(item);
  };
  const collegeCandidate = ranked.find((item) => item.sport === "ncaaf");
  const proCandidate = ranked.find((item) => item.sport === "nfl");
  if (collegeCandidate && proCandidate) {
    addCandidate(collegeCandidate);
    addCandidate(proCandidate);
  }
  for (const item of ranked) {
    if (selected.length >= 6) break;
    addCandidate(item);
  }
  return selected;
}

function biggestMovement(game: FinalGame, index: Map<string, OddsSnapshot[]>) {
  const options: Array<{ market: OddsSnapshot["market"]; marketLabel: string; unit: string }> = [
    { market: "spreads", marketLabel: "Spread", unit: "points" },
    { market: "totals", marketLabel: "Total", unit: "points" },
    { market: "h2h", marketLabel: "Moneyline", unit: "odds units" },
  ];
  const kickoff = Date.parse(game.starts_at);
  const candidates: Array<{ market: string; marketLabel: string; unit: string; sportsbook: string; from: string; to: string; magnitude: number; earliestAt: string; latestAt: string; earliestLabel: string }> = [];
  for (const option of options) {
    const snapshots = (index.get(`${game.id}:${option.market}`) ?? []).filter((item) => Date.parse(item.observed_at) <= kickoff);
    const byBook = new Map<string, OddsSnapshot[]>();
    for (const snapshot of snapshots) {
      const rows = byBook.get(snapshot.sportsbook) ?? [];
      rows.push(snapshot);
      byBook.set(snapshot.sportsbook, rows);
    }
    for (const [sportsbook, rows] of byBook) {
      const earliest = rows.find((row) => row.is_earliest) ?? rows[0];
      const latest = rows.reduce((last, row) => Date.parse(row.observed_at) > Date.parse(last.observed_at) ? row : last, rows[0]);
      if (earliest.id === latest.id || earliest.observed_at === latest.observed_at) continue;
      const targetName = option.market === "totals" ? "Over" : game.home_team;
      const earliestOutcome = earliest.outcomes.find((outcome) => outcome.name === targetName);
      const latestOutcome = latest.outcomes.find((outcome) => outcome.name === targetName);
      const fromValue = option.market === "h2h" ? earliestOutcome?.price : earliestOutcome?.point;
      const toValue = option.market === "h2h" ? latestOutcome?.price : latestOutcome?.point;
      if (typeof fromValue !== "number" || typeof toValue !== "number") continue;
      const magnitude = Math.abs(toValue - fromValue);
      const threshold = option.market === "spreads" ? 1 : option.market === "totals" ? 1.5 : 25;
      if (magnitude < threshold) continue;
      candidates.push({
        market: option.market, marketLabel: option.marketLabel, unit: option.unit, sportsbook,
        from: formatSigned(fromValue), to: formatSigned(toValue), magnitude,
        earliestAt: earliest.observed_at, latestAt: latest.observed_at,
        earliestLabel: `Earliest recorded ${new Date(earliest.observed_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}:`,
      });
    }
  }
  return candidates.sort((a, b) => b.magnitude - a.magnitude)[0] ?? null;
}

function signed(value: number) { return `${value > 0 ? "+" : ""}${value.toFixed(1)}`; }
function formatSigned(value: number) { return value > 0 ? `+${value}` : String(value); }
function formatMeeting(game: FinalGame) {
  const winner = game.home_score! > game.away_score! ? game.home_team : game.away_team;
  return `${winner} ${Math.max(game.home_score!, game.away_score!)}–${Math.min(game.home_score!, game.away_score!)} on ${new Date(game.starts_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
}
