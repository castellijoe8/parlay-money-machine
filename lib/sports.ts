export const SPORTS = ["ncaaf", "nfl"] as const;

export type SupportedSport = (typeof SPORTS)[number];

export const SPORT_API_CONFIG: Record<
  SupportedSport,
  { oddsApiKey: string; label: string }
> = {
  ncaaf: { oddsApiKey: "americanfootball_ncaaf", label: "NCAAF" },
  nfl: { oddsApiKey: "americanfootball_nfl", label: "NFL" },
};
