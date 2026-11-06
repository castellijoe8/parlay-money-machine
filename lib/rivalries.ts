export type RivalPick = {
  id: string; user_id: string; game_id: string; pick: string;
  bet_type: string | null; line: number | null; result: string | null;
  units: number | null; game: { starts_at: string; away_team: string; home_team: string } | null;
};

export function resultCode(result: string | null) {
  return ({ won: "win", lost: "loss" } as Record<string, string>)[result ?? ""] ?? result ?? "pending";
}

function market(pick: RivalPick) {
  return (pick.bet_type ?? "").toLowerCase();
}

export function rivalryRecord(picks: RivalPick[], player: string, opponent: string) {
  const meetings = new Map<string, { yours: RivalPick[]; theirs: RivalPick[] }>();
  for (const pick of picks) {
    if (pick.user_id !== player && pick.user_id !== opponent) continue;
    const key = `${pick.game_id}:${market(pick)}`;
    const meeting = meetings.get(key) ?? { yours: [], theirs: [] };
    (pick.user_id === player ? meeting.yours : meeting.theirs).push(pick);
    meetings.set(key, meeting);
  }
  const record = { wins: 0, losses: 0, other: 0, pending: 0 };
  for (const meeting of meetings.values()) {
    // Count each game/market once. Only opposite selections establish a meeting.
    const pair = meeting.yours.flatMap((a) => meeting.theirs.map((b) => [a, b] as const))
      .find(([a, b]) => a.pick !== b.pick && ["spread", "moneyline", "total"].includes(market(a)));
    if (!pair) continue;
    const [a, b] = pair.map((pick) => resultCode(pick.result));
    if (a === "pending" || b === "pending") record.pending++;
    else if (a === "win" && b === "loss") record.wins++;
    else if (a === "loss" && b === "win") record.losses++;
    else record.other++;
  }
  return record;
}
