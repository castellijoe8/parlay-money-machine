"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Sport = "ncaaf" | "nfl";

type Game = {
  id: string;
  sport: Sport | null;
  away_team: string;
  home_team: string;
  starts_at: string;
  status: string;
  home_score: number | null;
  away_score: number | null;
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

type UserPick = {
  game_id: string;
  pick: string | null;
  bet_type: string | null;
  line: number | null;
  odds: number | null;
  result: string | null;
};

type ViewFilter = "all" | "live" | "upcoming";

type NcaafConference =
  | "SEC"
  | "Big Ten"
  | "Big 12"
  | "ACC"
  | "Pac-12"
  | "AAC"
  | "Mountain West"
  | "Sun Belt"
  | "C-USA"
  | "MAC"
  | "Independents";

type ConferenceFilter = "all" | NcaafConference;

type BetOption = {
  game: Game;
  pick: string;
  betType: "Spread" | "Total" | "Moneyline";
  line: number | null;
  odds: number | null;
};

const SCROLL_KEY = "parlay-money-machine-home-scroll";

/*
|--------------------------------------------------------------------------
| SPORT / CONFERENCE INFRASTRUCTURE
|--------------------------------------------------------------------------
|
| Keep sport-specific classification here rather than inside the UI.
|
| When NFL is added later, it can have its own classification system
| without changing any of the NCAAF filtering logic.
|
*/

const NCAAF_CONFERENCE_FILTERS: {
  value: ConferenceFilter;
  label: string;
}[] = [
  { value: "all", label: "All" },
  { value: "SEC", label: "SEC" },
  { value: "Big Ten", label: "Big Ten" },
  { value: "Big 12", label: "Big 12" },
  { value: "ACC", label: "ACC" },
  { value: "Pac-12", label: "Pac-12" },
  { value: "AAC", label: "AAC" },
  { value: "Mountain West", label: "Mountain West" },
  { value: "Sun Belt", label: "Sun Belt" },
  { value: "C-USA", label: "C-USA" },
  { value: "MAC", label: "MAC" },
  { value: "Independents", label: "Independents" },
];

/*
 * Team -> conference mapping.
 *
 * This is intentionally separate from the game filtering logic.
 * If conferences change, this is the only area we need to maintain.
 */
const NCAAF_TEAM_CONFERENCES: Record<
  string,
  NcaafConference
> = {
  // SEC
  "Alabama Crimson Tide": "SEC",
  "Arkansas Razorbacks": "SEC",
  "Auburn Tigers": "SEC",
  "Florida Gators": "SEC",
  "Georgia Bulldogs": "SEC",
  "Kentucky Wildcats": "SEC",
  "LSU Tigers": "SEC",
  "Mississippi State Bulldogs": "SEC",
  "Missouri Tigers": "SEC",
  "Ole Miss Rebels": "SEC",
  "Oklahoma Sooners": "SEC",
  "South Carolina Gamecocks": "SEC",
  "Tennessee Volunteers": "SEC",
  "Texas Longhorns": "SEC",
  "Texas A&M Aggies": "SEC",
  "Vanderbilt Commodores": "SEC",

  // Big Ten
  "Illinois Fighting Illini": "Big Ten",
  "Indiana Hoosiers": "Big Ten",
  "Iowa Hawkeyes": "Big Ten",
  "Maryland Terrapins": "Big Ten",
  "Michigan Wolverines": "Big Ten",
  "Michigan State Spartans": "Big Ten",
  "Minnesota Golden Gophers": "Big Ten",
  "Nebraska Cornhuskers": "Big Ten",
  "Northwestern Wildcats": "Big Ten",
  "Ohio State Buckeyes": "Big Ten",
  "Oregon Ducks": "Big Ten",
  "Penn State Nittany Lions": "Big Ten",
  "Purdue Boilermakers": "Big Ten",
  "Rutgers Scarlet Knights": "Big Ten",
  "UCLA Bruins": "Big Ten",
  "USC Trojans": "Big Ten",
  "Washington Huskies": "Big Ten",
  "Wisconsin Badgers": "Big Ten",

  // Big 12
  "Arizona Wildcats": "Big 12",
  "Arizona State Sun Devils": "Big 12",
  "Baylor Bears": "Big 12",
  "BYU Cougars": "Big 12",
  "Cincinnati Bearcats": "Big 12",
  "Colorado Buffaloes": "Big 12",
  "Houston Cougars": "Big 12",
  "Iowa State Cyclones": "Big 12",
  "Kansas Jayhawks": "Big 12",
  "Kansas State Wildcats": "Big 12",
  "Oklahoma State Cowboys": "Big 12",
  "TCU Horned Frogs": "Big 12",
  "Texas Tech Red Raiders": "Big 12",
  "UCF Knights": "Big 12",
  "Utah Utes": "Big 12",
  "West Virginia Mountaineers": "Big 12",

  // ACC
  "Boston College Eagles": "ACC",
  "California Golden Bears": "ACC",
  "Clemson Tigers": "ACC",
  "Duke Blue Devils": "ACC",
  "Florida State Seminoles": "ACC",
  "Georgia Tech Yellow Jackets": "ACC",
  "Louisville Cardinals": "ACC",
  "Miami Hurricanes": "ACC",
  "Miami (FL) Hurricanes": "ACC",
  "North Carolina Tar Heels": "ACC",
  "NC State Wolfpack": "ACC",
  "Pittsburgh Panthers": "ACC",
  "SMU Mustangs": "ACC",
  "Stanford Cardinal": "ACC",
  "Syracuse Orange": "ACC",
  "Virginia Cavaliers": "ACC",
  "Virginia Tech Hokies": "ACC",
  "Wake Forest Demon Deacons": "ACC",

  // Pac-12
  "Oregon State Beavers": "Pac-12",
  "Washington State Cougars": "Pac-12",
  "Boise State Broncos": "Pac-12",
  "Colorado State Rams": "Pac-12",
  "Fresno State Bulldogs": "Pac-12",
  "San Diego State Aztecs": "Pac-12",
  "Utah State Aggies": "Pac-12",

  // AAC
  "Army Black Knights": "AAC",
  "Charlotte 49ers": "AAC",
  "East Carolina Pirates": "AAC",
  "Florida Atlantic Owls": "AAC",
  "Memphis Tigers": "AAC",
  "Navy Midshipmen": "AAC",
  "North Texas Mean Green": "AAC",
  "Rice Owls": "AAC",
  "South Florida Bulls": "AAC",
  "Temple Owls": "AAC",
  "Tulane Green Wave": "AAC",
  "Tulsa Golden Hurricane": "AAC",
  "UAB Blazers": "AAC",
  "UTSA Roadrunners": "AAC",

  // Mountain West
  "Air Force Falcons": "Mountain West",
  "Hawaii Rainbow Warriors": "Mountain West",
  "Nevada Wolf Pack": "Mountain West",
  "New Mexico Lobos": "Mountain West",
  "San Jose State Spartans": "Mountain West",
  "UNLV Rebels": "Mountain West",
  "Wyoming Cowboys": "Mountain West",
  "New Mexico State Aggies": "Mountain West",

  // Sun Belt
  "Appalachian State Mountaineers": "Sun Belt",
  "Arkansas State Red Wolves": "Sun Belt",
  "Coastal Carolina Chanticleers": "Sun Belt",
  "Georgia Southern Eagles": "Sun Belt",
  "Georgia State Panthers": "Sun Belt",
  "James Madison Dukes": "Sun Belt",
  "Louisiana Ragin' Cajuns": "Sun Belt",
  "Marshall Thundering Herd": "Sun Belt",
  "Old Dominion Monarchs": "Sun Belt",
  "South Alabama Jaguars": "Sun Belt",
  "Southern Miss Golden Eagles": "Sun Belt",
  "Texas State Bobcats": "Sun Belt",
  "Troy Trojans": "Sun Belt",
  "UL Monroe Warhawks": "Sun Belt",

  // Conference USA
  "Delaware Blue Hens": "C-USA",
  "FIU Panthers": "C-USA",
  "Jacksonville State Gamecocks": "C-USA",
  "Kennesaw State Owls": "C-USA",
  "Liberty Flames": "C-USA",
  "Middle Tennessee Blue Raiders": "C-USA",
  "Missouri State Bears": "C-USA",
  "Sam Houston Bearkats": "C-USA",
  "UTEP Miners": "C-USA",
  "Western Kentucky Hilltoppers": "C-USA",

  // MAC
  "Akron Zips": "MAC",
  "Ball State Cardinals": "MAC",
  "Bowling Green Falcons": "MAC",
  "Buffalo Bulls": "MAC",
  "Central Michigan Chippewas": "MAC",
  "Eastern Michigan Eagles": "MAC",
  "Kent State Golden Flashes": "MAC",
  "Miami (OH) RedHawks": "MAC",
  "Northern Illinois Huskies": "MAC",
  "Ohio Bobcats": "MAC",
  "Toledo Rockets": "MAC",
  "Western Michigan Broncos": "MAC",

  // Independents
  "Notre Dame Fighting Irish": "Independents",
  "UConn Huskies": "Independents",
  "UMass Minutemen": "Independents",
};

/*
 * Some feeds use slightly different team names.
 * Normalize those names before looking up the conference.
 */
const NCAAF_TEAM_ALIASES: Record<string, string> = {
  "Alabama": "Alabama Crimson Tide",
  "Arkansas": "Arkansas Razorbacks",
  "Auburn": "Auburn Tigers",
  "Florida": "Florida Gators",
  "Georgia": "Georgia Bulldogs",
  "Kentucky": "Kentucky Wildcats",
  "LSU": "LSU Tigers",
  "Mississippi State": "Mississippi State Bulldogs",
  "Missouri": "Missouri Tigers",
  "Ole Miss": "Ole Miss Rebels",
  "Oklahoma": "Oklahoma Sooners",
  "South Carolina": "South Carolina Gamecocks",
  "Tennessee": "Tennessee Volunteers",
  "Texas": "Texas Longhorns",
  "Texas A&M": "Texas A&M Aggies",
  "Vanderbilt": "Vanderbilt Commodores",

  "Illinois": "Illinois Fighting Illini",
  "Indiana": "Indiana Hoosiers",
  "Iowa": "Iowa Hawkeyes",
  "Maryland": "Maryland Terrapins",
  "Michigan": "Michigan Wolverines",
  "Michigan State": "Michigan State Spartans",
  "Minnesota": "Minnesota Golden Gophers",
  "Nebraska": "Nebraska Cornhuskers",
  "Northwestern": "Northwestern Wildcats",
  "Ohio State": "Ohio State Buckeyes",
  "Oregon": "Oregon Ducks",
  "Penn State": "Penn State Nittany Lions",
  "Purdue": "Purdue Boilermakers",
  "Rutgers": "Rutgers Scarlet Knights",
  "UCLA": "UCLA Bruins",
  "USC": "USC Trojans",
  "Washington": "Washington Huskies",
  "Wisconsin": "Wisconsin Badgers",

  "Arizona": "Arizona Wildcats",
  "Arizona State": "Arizona State Sun Devils",
  "BYU": "BYU Cougars",
  "Baylor": "Baylor Bears",
  "Cincinnati": "Cincinnati Bearcats",
  "Colorado": "Colorado Buffaloes",
  "Houston": "Houston Cougars",
  "Iowa State": "Iowa State Cyclones",
  "Kansas": "Kansas Jayhawks",
  "Kansas State": "Kansas State Wildcats",
  "Oklahoma State": "Oklahoma State Cowboys",
  "TCU": "TCU Horned Frogs",
  "Texas Tech": "Texas Tech Red Raiders",
  "UCF": "UCF Knights",
  "Utah": "Utah Utes",
  "West Virginia": "West Virginia Mountaineers",

  "Boston College": "Boston College Eagles",
  "Cal": "California Golden Bears",
  "California": "California Golden Bears",
  "Clemson": "Clemson Tigers",
  "Duke": "Duke Blue Devils",
  "Florida State": "Florida State Seminoles",
  "Georgia Tech": "Georgia Tech Yellow Jackets",
  "Louisville": "Louisville Cardinals",
  "Miami": "Miami Hurricanes",
  "Miami (FL)": "Miami (FL) Hurricanes",
  "North Carolina": "North Carolina Tar Heels",
  "NC State": "NC State Wolfpack",
  "Pittsburgh": "Pittsburgh Panthers",
  "SMU": "SMU Mustangs",
  "Stanford": "Stanford Cardinal",
  "Syracuse": "Syracuse Orange",
  "Virginia": "Virginia Cavaliers",
  "Virginia Tech": "Virginia Tech Hokies",
  "Wake Forest": "Wake Forest Demon Deacons",

  "Oregon State": "Oregon State Beavers",
  "Washington State": "Washington State Cougars",
  "Boise State": "Boise State Broncos",
  "Colorado State": "Colorado State Rams",
  "Fresno State": "Fresno State Bulldogs",
  "San Diego State": "San Diego State Aztecs",
  "Utah State": "Utah State Aggies",

  "Army": "Army Black Knights",
  "Charlotte": "Charlotte 49ers",
  "East Carolina": "East Carolina Pirates",
  "FAU": "Florida Atlantic Owls",
  "Florida Atlantic": "Florida Atlantic Owls",
  "Memphis": "Memphis Tigers",
  "Navy": "Navy Midshipmen",
  "North Texas": "North Texas Mean Green",
  "Rice": "Rice Owls",
  "South Florida": "South Florida Bulls",
  "USF": "South Florida Bulls",
  "Temple": "Temple Owls",
  "Tulane": "Tulane Green Wave",
  "Tulsa": "Tulsa Golden Hurricane",
  "UAB": "UAB Blazers",
  "UTSA": "UTSA Roadrunners",

  "Air Force": "Air Force Falcons",
  "Hawaii": "Hawaii Rainbow Warriors",
  "Nevada": "Nevada Wolf Pack",
  "New Mexico": "New Mexico Lobos",
  "San Jose State": "San Jose State Spartans",
  "UNLV": "UNLV Rebels",
  "Wyoming": "Wyoming Cowboys",

  "Appalachian State": "Appalachian State Mountaineers",
  "Arkansas State": "Arkansas State Red Wolves",
  "Coastal Carolina": "Coastal Carolina Chanticleers",
  "Georgia Southern": "Georgia Southern Eagles",
  "Georgia State": "Georgia State Panthers",
  "James Madison": "James Madison Dukes",
  "Louisiana": "Louisiana Ragin' Cajuns",
  "Marshall": "Marshall Thundering Herd",
  "Old Dominion": "Old Dominion Monarchs",
  "South Alabama": "South Alabama Jaguars",
  "Southern Miss": "Southern Miss Golden Eagles",
  "Texas State": "Texas State Bobcats",
  "Troy": "Troy Trojans",
  "UL Monroe": "UL Monroe Warhawks",

  "Delaware": "Delaware Blue Hens",
  "FIU": "FIU Panthers",
  "Jacksonville State": "Jacksonville State Gamecocks",
  "Kennesaw State": "Kennesaw State Owls",
  "Liberty": "Liberty Flames",
  "Middle Tennessee": "Middle Tennessee Blue Raiders",
  "Missouri State": "Missouri State Bears",
  "Sam Houston": "Sam Houston Bearkats",
  "UTEP": "UTEP Miners",
  "Western Kentucky": "Western Kentucky Hilltoppers",

  "Akron": "Akron Zips",
  "Ball State": "Ball State Cardinals",
  "Bowling Green": "Bowling Green Falcons",
  "Buffalo": "Buffalo Bulls",
  "Central Michigan": "Central Michigan Chippewas",
  "Eastern Michigan": "Eastern Michigan Eagles",
  "Kent State": "Kent State Golden Flashes",
  "Miami (OH)": "Miami (OH) RedHawks",
  "Northern Illinois": "Northern Illinois Huskies",
  "Ohio": "Ohio Bobcats",
  "Toledo": "Toledo Rockets",
  "Western Michigan": "Western Michigan Broncos",

  "Notre Dame": "Notre Dame Fighting Irish",
  "UConn": "UConn Huskies",
  "UMass": "UMass Minutemen",
};

function normalizeTeamName(team: string) {
  const trimmed = team.trim();

  if (NCAAF_TEAM_CONFERENCES[trimmed]) {
    return trimmed;
  }

  if (NCAAF_TEAM_ALIASES[trimmed]) {
    return NCAAF_TEAM_ALIASES[trimmed];
  }

  return trimmed;
}

function getNcaafConference(
  team: string
): NcaafConference | null {
  const normalized = normalizeTeamName(team);

  return (
    NCAAF_TEAM_CONFERENCES[normalized] ?? null
  );
}

function getGameSport(game: Game): Sport {
  return game.sport === "nfl" ? "nfl" : "ncaaf";
}

function gameMatchesConference(
  game: Game,
  conference: ConferenceFilter
) {
  if (conference === "all") {
    return true;
  }

  /*
   * Conference filters are intentionally NCAAF-only.
   *
   * This means an eventual NFL game can never accidentally appear
   * when someone selects SEC, Big Ten, etc.
   */
  if (getGameSport(game) !== "ncaaf") {
    return false;
  }

  const awayConference =
    getNcaafConference(game.away_team);

  const homeConference =
    getNcaafConference(game.home_team);

  return (
    awayConference === conference ||
    homeConference === conference
  );
}

export default function HomePage() {
  const [games, setGames] = useState<Game[]>([]);
  const [userPicks, setUserPicks] = useState<
    Record<string, UserPick>
  >({});
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const [viewFilter, setViewFilter] =
    useState<ViewFilter>("all");

  const [conferenceFilter, setConferenceFilter] =
    useState<ConferenceFilter>("all");

  const [selectedBet, setSelectedBet] =
    useState<BetOption | null>(null);

  const [placingWager, setPlacingWager] =
    useState(false);

  const [wagerMessage, setWagerMessage] =
    useState("");

  useEffect(() => {
    loadGames();
    loadUserPicks();

    const interval = setInterval(async () => {
      try {
        await fetch("/api/sync-scores");
        await loadGames();
        await loadUserPicks();
      } catch (error) {
        console.error("Score refresh error:", error);
      }
    }, 60 * 1000);

    const handleScroll = () => {
      sessionStorage.setItem(
        SCROLL_KEY,
        String(window.scrollY)
      );
    };

    window.addEventListener("scroll", handleScroll);

    return () => {
      clearInterval(interval);
      window.removeEventListener(
        "scroll",
        handleScroll
      );
    };
  }, []);

  useEffect(() => {
    if (loading || games.length === 0) return;

    const savedScroll =
      sessionStorage.getItem(SCROLL_KEY);

    if (!savedScroll) return;

    requestAnimationFrame(() => {
      window.scrollTo({
        top: Number(savedScroll),
        behavior: "instant",
      });
    });
  }, [loading, games.length]);

  async function loadGames() {
    setLoading(true);
    setMessage("");

    const { data, error } = await supabase
      .from("games")
      .select(
        "id, sport, away_team, home_team, starts_at, status, home_score, away_score, spread, spread_home, spread_odds_away, spread_odds_home, total, total_odds_over, total_odds_under, moneyline_away, moneyline_home"
      )
      .in("status", ["scheduled", "live"])
      .order("starts_at", {
        ascending: true,
      });

    if (error) {
      console.error("Games error:", error);
      setMessage(
        `Database error: ${error.message}`
      );
      setLoading(false);
      return;
    }

    const now = new Date();

    const visibleGames = (data ?? []).filter(
      (game) => {
        const startTime = new Date(
          game.starts_at
        );

        if (game.status === "live") {
          return true;
        }

        return startTime >= now;
      }
    );

    setGames(visibleGames as Game[]);
    setLoading(false);
  }

  async function loadUserPicks() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return;
    }

    const { data, error } = await supabase
      .from("picks")
      .select(
        "game_id, pick, bet_type, line, odds, result"
      )
      .eq("user_id", user.id);

    if (error) {
      console.error(
        "User picks error:",
        error
      );
      return;
    }

    const pickMap: Record<
      string,
      UserPick
    > = {};

    (data ?? []).forEach((pick) => {
      if (!pick.game_id) return;

      pickMap[pick.game_id] = pick;
    });

    setUserPicks(pickMap);
  }

  function saveScrollPosition() {
    sessionStorage.setItem(
      SCROLL_KEY,
      String(window.scrollY)
    );
  }

  function formatDate(date: string) {
    return new Date(date).toLocaleString([], {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function formatShortDate(date: string) {
    return new Date(date).toLocaleString([], {
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

    return odds > 0
      ? `+${odds}`
      : String(odds);
  }

  function formatLine(line: number | null) {
    if (line === null) {
      return "—";
    }

    return line > 0
      ? `+${line}`
      : String(line);
  }

  function isLive(game: Game) {
    return (
      game.status === "live" ||
      (game.away_score !== null &&
        game.home_score !== null)
    );
  }

  function isGameStarted(game: Game) {
    return (
      new Date(game.starts_at).getTime() <=
      Date.now()
    );
  }

  function formatUserPick(pick: UserPick) {
    if (pick.bet_type === "spread") {
      return `${pick.pick ?? "Pick"} ${
        pick.line !== null
          ? formatLine(pick.line)
          : ""
      } ${formatOdds(pick.odds)}`.trim();
    }

    if (pick.bet_type === "total") {
      return `${pick.pick ?? "Pick"} ${
        pick.line !== null
          ? pick.line
          : ""
      } ${formatOdds(pick.odds)}`.trim();
    }

    if (pick.bet_type === "moneyline") {
      return `${pick.pick ?? "Pick"} ${formatOdds(
        pick.odds
      )}`.trim();
    }

    return pick.pick ?? "Wager placed";
  }

  function getPickStatus(pick: UserPick) {
    const result = String(
      pick.result ?? ""
    )
      .trim()
      .toLowerCase();

    if (result === "win") {
      return {
        label: "WIN",
        className:
          "border-green-200 bg-green-50 text-green-700",
      };
    }

    if (result === "loss") {
      return {
        label: "LOSS",
        className:
          "border-red-200 bg-red-50 text-red-700",
      };
    }

    if (result === "push") {
      return {
        label: "PUSH",
        className:
          "border-yellow-200 bg-yellow-50 text-yellow-700",
      };
    }

    return {
      label: "PENDING",
      className:
        "border-gray-200 bg-gray-50 text-gray-600",
    };
  }

  function getDayKey(date: string) {
    const gameDate = new Date(date);

    return `${gameDate.getFullYear()}-${String(
      gameDate.getMonth() + 1
    ).padStart(2, "0")}-${String(
      gameDate.getDate()
    ).padStart(2, "0")}`;
  }

  function formatDayHeader(date: string) {
    const gameDate = new Date(date);

    const today = new Date();

    const tomorrow = new Date();
    tomorrow.setDate(
      today.getDate() + 1
    );

    const isSameDay = (
      a: Date,
      b: Date
    ) =>
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate();

    if (isSameDay(gameDate, today)) {
      return "Today";
    }

    if (
      isSameDay(
        gameDate,
        tomorrow
      )
    ) {
      return "Tomorrow";
    }

    return gameDate.toLocaleDateString([], {
      weekday: "long",
      month: "short",
      day: "numeric",
    });
  }

  function selectBet(option: BetOption) {
    const existingPick =
      userPicks[option.game.id];

    if (existingPick) {
      return;
    }

    if (
      isLive(option.game) ||
      isGameStarted(option.game)
    ) {
      setWagerMessage(
        "Wagering is closed for this game."
      );
      setSelectedBet(null);
      return;
    }

    setWagerMessage("");
    setSelectedBet(option);
  }

  function isSelected(
    gameId: string,
    pick: string,
    betType: string
  ) {
    return (
      selectedBet?.game.id === gameId &&
      selectedBet.pick === pick &&
      selectedBet.betType === betType
    );
  }

  async function placeWager() {
    if (
      !selectedBet ||
      placingWager
    ) {
      return;
    }

    setPlacingWager(true);
    setWagerMessage("");

    try {
      const {
        data: { user },
      } =
        await supabase.auth.getUser();

      if (!user) {
        setWagerMessage(
          "Please log in to place a wager."
        );
        setPlacingWager(false);
        return;
      }

      if (
        isGameStarted(
          selectedBet.game
        )
      ) {
        setWagerMessage(
          "Wagering is closed: this game has already started."
        );
        setPlacingWager(false);
        setSelectedBet(null);
        return;
      }

      const {
        data: profile,
        error: profileError,
      } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError) {
        console.error(
          "Profile error:",
          profileError
        );

        setWagerMessage(
          "Could not load your profile. Please try again."
        );

        setPlacingWager(false);
        return;
      }

      const { error } =
        await supabase
          .from("picks")
          .insert({
            game_id:
              selectedBet.game.id,
            user_id: user.id,
            user_name:
              profile?.display_name?.trim() ||
              "Player",
            pick: selectedBet.pick,
            bet_type:
              selectedBet.betType,
            line: selectedBet.line,
            odds: selectedBet.odds,
            result: "pending",
            units: 1,
          });

      if (error) {
        console.error(
          "Place wager error:",
          error
        );

        const errorMessage =
          String(
            error.message ?? ""
          ).toLowerCase();

        if (
          errorMessage.includes(
            "wagering is closed"
          ) ||
          errorMessage.includes(
            "already started"
          )
        ) {
          setWagerMessage(
            "Wagering is closed: this game has already started."
          );
        } else if (
          errorMessage.includes(
            "duplicate"
          ) ||
          errorMessage.includes(
            "unique"
          )
        ) {
          setWagerMessage(
            "You already have a wager on this game."
          );
        } else {
          setWagerMessage(
            "Could not place wager. Please try again."
          );
        }

        setPlacingWager(false);
        return;
      }

      await loadUserPicks();

      setSelectedBet(null);
      setWagerMessage("");

      saveScrollPosition();

      window.location.href =
        "/wagers";
    } catch (error) {
      console.error(
        "Unexpected wager error:",
        error
      );

      setWagerMessage(
        "Something went wrong. Please try again."
      );

      setPlacingWager(false);
    }
  }

  /*
  |--------------------------------------------------------------------------
  | GAME FILTERING
  |--------------------------------------------------------------------------
  */

  const liveGames = games
    .filter((game) =>
      isLive(game)
    )
    .sort(
      (a, b) =>
        new Date(
          a.starts_at
        ).getTime() -
        new Date(
          b.starts_at
        ).getTime()
    );

  const upcomingGames = games
    .filter(
      (game) => !isLive(game)
    )
    .sort(
      (a, b) =>
        new Date(
          a.starts_at
        ).getTime() -
        new Date(
          b.starts_at
        ).getTime()
    );

  /*
   * Conference filtering is applied independently from
   * Live / Upcoming filtering.
   */
  const conferenceFilteredLiveGames =
    useMemo(() => {
      return liveGames.filter(
        (game) =>
          gameMatchesConference(
            game,
            conferenceFilter
          )
      );
    }, [
      liveGames,
      conferenceFilter,
    ]);

  const conferenceFilteredUpcomingGames =
    useMemo(() => {
      return upcomingGames.filter(
        (game) =>
          gameMatchesConference(
            game,
            conferenceFilter
          )
      );
    }, [
      upcomingGames,
      conferenceFilter,
    ]);

  const filteredLiveGames =
    useMemo(() => {
      if (
        viewFilter ===
        "upcoming"
      ) {
        return [];
      }

      return conferenceFilteredLiveGames;
    }, [
      conferenceFilteredLiveGames,
      viewFilter,
    ]);

  const filteredUpcomingGames =
    useMemo(() => {
      if (
        viewFilter === "live"
      ) {
        return [];
      }

      return conferenceFilteredUpcomingGames;
    }, [
      conferenceFilteredUpcomingGames,
      viewFilter,
    ]);

  const groupedUpcoming =
    filteredUpcomingGames.reduce(
      (groups, game) => {
        const key = getDayKey(
          game.starts_at
        );

        if (!groups[key]) {
          groups[key] = [];
        }

        groups[key].push(game);

        return groups;
      },
      {} as Record<
        string,
        Game[]
      >
    );

  const pendingPickCount =
    Object.values(
      userPicks
    ).filter((pick) => {
      const result = String(
        pick.result ?? ""
      )
        .trim()
        .toLowerCase();

      return (
        !result ||
        result === "pending"
      );
    }).length;

  const gamesWithPicks =
    games.filter(
      (game) =>
        userPicks[game.id]
    ).length;

  /*
   * This count represents the currently selected
   * conference filter, independent of Live / Upcoming.
   */
  const conferenceFilteredGameCount =
    conferenceFilteredLiveGames.length +
    conferenceFilteredUpcomingGames.length;

  function renderGameCard(
    game: Game
  ) {
    const live = isLive(game);
    const started =
      isGameStarted(game);
    const existingPick =
      userPicks[game.id];

    const pickStatus =
      existingPick
        ? getPickStatus(
            existingPick
          )
        : null;

    const wageringClosed =
      live || started;

    return (
      <div
        key={game.id}
        id={`game-${game.id}`}
        className={`overflow-hidden rounded-2xl bg-white shadow-sm ${
          live
            ? "border border-red-200 ring-1 ring-red-100"
            : "border border-gray-100"
        }`}
      >
        {/* Game Header */}
        <div className="p-3.5 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              {live ? (
                <div className="mb-1.5 inline-flex items-center gap-1.5 rounded-full bg-red-100 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-red-700 sm:text-xs">
                  <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                  Live Now
                </div>
              ) : (
                <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-gray-400 sm:text-xs">
                  {formatShortDate(
                    game.starts_at
                  )}
                </p>
              )}

              <h3 className="truncate text-base font-extrabold leading-tight text-gray-900 sm:text-xl">
                {game.away_team}{" "}
                <span className="font-normal text-gray-400">
                  vs.
                </span>{" "}
                {game.home_team}
              </h3>
            </div>

            {live ? (
              <div className="shrink-0 text-right">
                <p className="text-xl font-extrabold leading-none text-gray-900 sm:text-2xl">
                  {game.away_score ??
                    0}{" "}
                  —{" "}
                  {game.home_score ??
                    0}
                </p>

                <p className="mt-1 text-[9px] font-bold uppercase tracking-wide text-red-500">
                  Live
                </p>
              </div>
            ) : null}
          </div>

          {/* Existing Pick */}
          {existingPick ? (
            <div
              className={`mt-3 rounded-xl border px-3 py-2.5 ${pickStatus?.className}`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-[9px] font-extrabold uppercase tracking-wide sm:text-[10px]">
                      Your Pick
                    </p>

                    <span className="text-[9px] font-bold opacity-50 sm:text-[10px]">
                      ·
                    </span>

                    <span className="text-[9px] font-extrabold uppercase tracking-wide sm:text-[10px]">
                      {
                        pickStatus?.label
                      }
                    </span>
                  </div>

                  <p className="mt-0.5 truncate text-sm font-extrabold text-gray-900 sm:text-base">
                    {formatUserPick(
                      existingPick
                    )}
                  </p>
                </div>

                <button
                  onClick={() => {
                    saveScrollPosition();
                    window.location.href = `/wager/${game.id}`;
                  }}
                  className="shrink-0 rounded-lg bg-gray-900 px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-white transition hover:bg-gray-700 sm:px-3.5 sm:text-xs"
                >
                  View Bet
                </button>
              </div>
            </div>
          ) : null}

          {/* Betting Markets */}
          <div className="mt-3 grid grid-cols-3 gap-1.5 sm:mt-4 sm:gap-2">
            {/* Spread */}
            <div className="rounded-xl bg-gray-50 p-2.5 sm:p-3">
              <p className="text-[9px] font-extrabold uppercase tracking-wide text-gray-400 sm:text-[10px]">
                Spread
              </p>

              <div className="mt-2 space-y-1.5">
                <button
                  disabled={
                    wageringClosed ||
                    Boolean(
                      existingPick
                    )
                  }
                  onClick={() =>
                    selectBet({
                      game,
                      pick: game.away_team,
                      betType:
                        "Spread",
                      line:
                        game.spread,
                      odds:
                        game.spread_odds_away,
                    })
                  }
                  className={`flex w-full items-center justify-between gap-1 rounded-lg px-1.5 py-1 text-left transition ${
                    isSelected(
                      game.id,
                      game.away_team,
                      "Spread"
                    )
                      ? "bg-green-100 ring-1 ring-green-300"
                      : "hover:bg-gray-100"
                  } ${
                    wageringClosed ||
                    existingPick
                      ? "cursor-default opacity-60"
                      : "cursor-pointer"
                  }`}
                >
                  <span className="truncate text-[10px] font-medium text-gray-600 sm:text-xs">
                    {
                      game.away_team
                    }
                  </span>

                  <span className="shrink-0 text-[10px] font-bold text-gray-900 sm:text-xs">
                    {formatLine(
                      game.spread
                    )}{" "}
                    <span className="font-medium text-gray-500">
                      {formatOdds(
                        game.spread_odds_away
                      )}
                    </span>
                  </span>
                </button>

                <button
                  disabled={
                    wageringClosed ||
                    Boolean(
                      existingPick
                    )
                  }
                  onClick={() =>
                    selectBet({
                      game,
                      pick: game.home_team,
                      betType:
                        "Spread",
                      line:
                        game.spread_home,
                      odds:
                        game.spread_odds_home,
                    })
                  }
                  className={`flex w-full items-center justify-between gap-1 rounded-lg px-1.5 py-1 text-left transition ${
                    isSelected(
                      game.id,
                      game.home_team,
                      "Spread"
                    )
                      ? "bg-green-100 ring-1 ring-green-300"
                      : "hover:bg-gray-100"
                  } ${
                    wageringClosed ||
                    existingPick
                      ? "cursor-default opacity-60"
                      : "cursor-pointer"
                  }`}
                >
                  <span className="truncate text-[10px] font-medium text-gray-600 sm:text-xs">
                    {
                      game.home_team
                    }
                  </span>

                  <span className="shrink-0 text-[10px] font-bold text-gray-900 sm:text-xs">
                    {formatLine(
                      game.spread_home
                    )}{" "}
                    <span className="font-medium text-gray-500">
                      {formatOdds(
                        game.spread_odds_home
                      )}
                    </span>
                  </span>
                </button>
              </div>
            </div>

            {/* Total */}
            <div className="rounded-xl bg-gray-50 p-2.5 sm:p-3">
              <p className="text-[9px] font-extrabold uppercase tracking-wide text-gray-400 sm:text-[10px]">
                Total
              </p>

              <div className="mt-2 space-y-1.5">
                <button
                  disabled={
                    wageringClosed ||
                    Boolean(
                      existingPick
                    )
                  }
                  onClick={() =>
                    selectBet({
                      game,
                      pick: "Over",
                      betType:
                        "Total",
                      line:
                        game.total,
                      odds:
                        game.total_odds_over,
                    })
                  }
                  className={`flex w-full items-center justify-between gap-1 rounded-lg px-1.5 py-1 text-left transition ${
                    isSelected(
                      game.id,
                      "Over",
                      "Total"
                    )
                      ? "bg-green-100 ring-1 ring-green-300"
                      : "hover:bg-gray-100"
                  } ${
                    wageringClosed ||
                    existingPick
                      ? "cursor-default opacity-60"
                      : "cursor-pointer"
                  }`}
                >
                  <span className="text-[10px] font-medium text-gray-600 sm:text-xs">
                    Over
                  </span>

                  <span className="shrink-0 text-[10px] font-bold text-gray-900 sm:text-xs">
                    {game.total ??
                      "—"}{" "}
                    <span className="font-medium text-gray-500">
                      {formatOdds(
                        game.total_odds_over
                      )}
                    </span>
                  </span>
                </button>

                <button
                  disabled={
                    wageringClosed ||
                    Boolean(
                      existingPick
                    )
                  }
                  onClick={() =>
                    selectBet({
                      game,
                      pick: "Under",
                      betType:
                        "Total",
                      line:
                        game.total,
                      odds:
                        game.total_odds_under,
                    })
                  }
                  className={`flex w-full items-center justify-between gap-1 rounded-lg px-1.5 py-1 text-left transition ${
                    isSelected(
                      game.id,
                      "Under",
                      "Total"
                    )
                      ? "bg-green-100 ring-1 ring-green-300"
                      : "hover:bg-gray-100"
                  } ${
                    wageringClosed ||
                    existingPick
                      ? "cursor-default opacity-60"
                      : "cursor-pointer"
                  }`}
                >
                  <span className="text-[10px] font-medium text-gray-600 sm:text-xs">
                    Under
                  </span>

                  <span className="shrink-0 text-[10px] font-bold text-gray-900 sm:text-xs">
                    {game.total ??
                      "—"}{" "}
                    <span className="font-medium text-gray-500">
                      {formatOdds(
                        game.total_odds_under
                      )}
                    </span>
                  </span>
                </button>
              </div>
            </div>

            {/* Moneyline */}
            <div className="rounded-xl bg-gray-50 p-2.5 sm:p-3">
              <p className="text-[9px] font-extrabold uppercase tracking-wide text-gray-400 sm:text-[10px]">
                Moneyline
              </p>

              <div className="mt-2 space-y-1.5">
                <button
                  disabled={
                    wageringClosed ||
                    Boolean(
                      existingPick
                    )
                  }
                  onClick={() =>
                    selectBet({
                      game,
                      pick: game.away_team,
                      betType:
                        "Moneyline",
                      line: null,
                      odds:
                        game.moneyline_away,
                    })
                  }
                  className={`flex w-full items-center justify-between gap-1 rounded-lg px-1.5 py-1 text-left transition ${
                    isSelected(
                      game.id,
                      game.away_team,
                      "Moneyline"
                    )
                      ? "bg-green-100 ring-1 ring-green-300"
                      : "hover:bg-gray-100"
                  } ${
                    wageringClosed ||
                    existingPick
                      ? "cursor-default opacity-60"
                      : "cursor-pointer"
                  }`}
                >
                  <span className="truncate text-[10px] font-medium text-gray-600 sm:text-xs">
                    {
                      game.away_team
                    }
                  </span>

                  <span className="shrink-0 text-[10px] font-bold text-gray-900 sm:text-xs">
                    {formatOdds(
                      game.moneyline_away
                    )}
                  </span>
                </button>

                <button
                  disabled={
                    wageringClosed ||
                    Boolean(
                      existingPick
                    )
                  }
                  onClick={() =>
                    selectBet({
                      game,
                      pick: game.home_team,
                      betType:
                        "Moneyline",
                      line: null,
                      odds:
                        game.moneyline_home,
                    })
                  }
                  className={`flex w-full items-center justify-between gap-1 rounded-lg px-1.5 py-1 text-left transition ${
                    isSelected(
                      game.id,
                      game.home_team,
                      "Moneyline"
                    )
                      ? "bg-green-100 ring-1 ring-green-300"
                      : "hover:bg-gray-100"
                  } ${
                    wageringClosed ||
                    existingPick
                      ? "cursor-default opacity-60"
                      : "cursor-pointer"
                  }`}
                >
                  <span className="truncate text-[10px] font-medium text-gray-600 sm:text-xs">
                    {
                      game.home_team
                    }
                  </span>

                  <span className="shrink-0 text-[10px] font-bold text-gray-900 sm:text-xs">
                    {formatOdds(
                      game.moneyline_home
                    )}
                  </span>
                </button>
              </div>
            </div>
          </div>

          {/* Main CTA */}
          {!existingPick ? (
            <button
              onClick={() => {
                saveScrollPosition();
                window.location.href = `/wager/${game.id}`;
              }}
              className="mt-3 w-full rounded-xl bg-gray-900 px-4 py-3 text-sm font-extrabold text-white transition hover:bg-gray-700 active:scale-[0.99] sm:mt-4"
            >
              Bet This Game →
            </button>
          ) : (
            <div className="mt-2 flex items-center justify-between px-1 text-[10px] font-semibold text-gray-400 sm:text-xs">
              <span>
                1 Unit Risked
              </span>

              <span>
                {formatDate(
                  game.starts_at
                )}
              </span>
            </div>
          )}
        </div>
      </div>
    );
  }

  const filterButtonClass = (
    filter: ViewFilter
  ) =>
    `rounded-lg px-3 py-1.5 text-xs font-bold transition sm:px-4 sm:py-2 ${
      viewFilter === filter
        ? "bg-gray-900 text-white shadow-sm"
        : "text-gray-500 hover:bg-gray-100 hover:text-gray-900"
    }`;

  const conferenceButtonClass = (
    filter: ConferenceFilter
  ) =>
    `shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
      conferenceFilter === filter
        ? "bg-green-600 text-white shadow-sm"
        : "text-gray-500 hover:bg-gray-100 hover:text-gray-900"
    }`;

  return (
    <main
      className={`min-h-screen bg-gray-50 px-3 py-4 sm:px-6 sm:py-8 ${
        selectedBet
          ? "pb-40 sm:pb-44"
          : ""
      }`}
    >
      <div className="mx-auto max-w-5xl">

        {/* Hero */}
        <section className="rounded-2xl bg-white p-4 shadow-sm sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-green-600 sm:text-xs">
                Parlay Money Machine
              </p>

              <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-gray-900 sm:text-3xl">
                Make your pick.
              </h1>

              <p className="mt-1 text-xs text-gray-500 sm:text-sm">
                1 unit. One game. No excuses.
              </p>
            </div>

            <div className="hidden shrink-0 text-right sm:block">
              <p className="text-2xl font-extrabold text-gray-900">
                {
                  conferenceFilteredGameCount
                }
              </p>

              <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">
                Games
              </p>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="mt-4 grid grid-cols-2 gap-2 sm:mt-5 sm:grid-cols-3">
            <button
              onClick={() => {
                window.location.href =
                  "/wagers";
              }}
              className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 text-left transition hover:border-gray-300 hover:bg-gray-100"
            >
              <p className="text-[9px] font-extrabold uppercase tracking-wide text-gray-400">
                My Bets
              </p>

              <p className="mt-0.5 text-sm font-extrabold text-gray-900">
                {pendingPickCount >
                0
                  ? `${pendingPickCount} Pending`
                  : "View Bets"}
              </p>
            </button>

            <button
              onClick={() => {
                window.location.href =
                  "/leaderboard";
              }}
              className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 text-left transition hover:border-gray-300 hover:bg-gray-100"
            >
              <p className="text-[9px] font-extrabold uppercase tracking-wide text-gray-400">
                Competition
              </p>

              <p className="mt-0.5 text-sm font-extrabold text-gray-900">
                Leaderboard →
              </p>
            </button>

            <div className="col-span-2 rounded-xl border border-green-100 bg-green-50 px-3 py-3 sm:col-span-1">
              <p className="text-[9px] font-extrabold uppercase tracking-wide text-green-600">
                Your Action
              </p>

              <p className="mt-0.5 text-sm font-extrabold text-green-900">
                {gamesWithPicks >
                0
                  ? `${gamesWithPicks} Pick${
                      gamesWithPicks ===
                      1
                        ? ""
                        : "s"
                    } Placed`
                  : "Pick a Game"}
              </p>
            </div>
          </div>
        </section>

        {/* Games */}
        <section className="mt-5 sm:mt-7">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-extrabold text-gray-900 sm:text-2xl">
                Games
              </h2>

              <p className="mt-0.5 text-xs text-gray-500 sm:text-sm">
                Tap a line to add it to your bet slip.
              </p>
            </div>

            <div className="text-right sm:hidden">
              <p className="text-lg font-extrabold text-gray-900">
                {
                  conferenceFilteredGameCount
                }
              </p>

              <p className="text-[9px] font-bold uppercase tracking-wide text-gray-400">
                Available
              </p>
            </div>
          </div>

          {/* Status Filters */}
          <div className="mt-3 flex items-center justify-between rounded-xl border border-gray-200 bg-white p-1">
            <div className="flex items-center gap-0.5">
              <button
                onClick={() =>
                  setViewFilter("all")
                }
                className={filterButtonClass(
                  "all"
                )}
              >
                All
              </button>

              <button
                onClick={() =>
                  setViewFilter("live")
                }
                className={filterButtonClass(
                  "live"
                )}
              >
                Live

                {liveGames.length >
                  0 && (
                  <span className="ml-1.5 rounded-full bg-red-100 px-1.5 py-0.5 text-[9px] text-red-700">
                    {
                      liveGames.length
                    }
                  </span>
                )}
              </button>

              <button
                onClick={() =>
                  setViewFilter(
                    "upcoming"
                  )
                }
                className={filterButtonClass(
                  "upcoming"
                )}
              >
                Upcoming
              </button>
            </div>

            <span className="hidden pr-2 text-[10px] font-medium text-gray-400 sm:block">
              {viewFilter ===
              "live"
                ? `${filteredLiveGames.length} live`
                : viewFilter ===
                  "upcoming"
                ? `${filteredUpcomingGames.length} upcoming`
                : `${conferenceFilteredGameCount} games`}
            </span>
          </div>

          {/* Conference Filters */}
          <div className="mt-2 overflow-hidden rounded-xl border border-gray-200 bg-white">
            <div className="flex gap-1.5 overflow-x-auto p-1.5 scrollbar-hide">
              {NCAAF_CONFERENCE_FILTERS.map(
                (filter) => (
                  <button
                    key={filter.value}
                    onClick={() =>
                      setConferenceFilter(
                        filter.value
                      )
                    }
                    className={conferenceButtonClass(
                      filter.value
                    )}
                  >
                    {filter.label}
                  </button>
                )
              )}
            </div>
          </div>

          {loading ? (
            <div className="mt-3 rounded-2xl bg-white p-6 shadow-sm">
              <p className="text-sm text-gray-500">
                Loading games...
              </p>
            </div>
          ) : message ? (
            <div className="mt-3 rounded-2xl bg-white p-6 shadow-sm">
              <p className="text-sm text-gray-500">
                {message}
              </p>
            </div>
          ) : games.length ===
            0 ? (
            <div className="mt-3 rounded-2xl bg-white p-6 shadow-sm">
              <p className="font-semibold text-gray-900">
                No upcoming games
              </p>

              <p className="mt-1 text-sm text-gray-500">
                Check back soon for new games.
              </p>
            </div>
          ) : (
            <div className="mt-4">

              {/* Live */}
              {filteredLiveGames.length >
              0 ? (
                <section className="mb-6">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-red-500" />

                    <h3 className="text-xs font-extrabold uppercase tracking-wide text-red-700 sm:text-sm">
                      Live Now
                    </h3>
                  </div>

                  <div className="space-y-2.5 sm:space-y-3">
                    {filteredLiveGames.map(
                      renderGameCard
                    )}
                  </div>
                </section>
              ) : null}

              {/* Upcoming */}
              {Object.entries(
                groupedUpcoming
              ).map(
                ([
                  dayKey,
                  dayGames,
                ]) => (
                  <section
                    key={dayKey}
                    className="mb-6"
                  >
                    <div className="mb-2 flex items-center justify-between border-b border-gray-200 pb-2">
                      <h3 className="text-xs font-extrabold uppercase tracking-wide text-gray-700 sm:text-sm">
                        {formatDayHeader(
                          dayGames[0]
                            .starts_at
                        )}
                      </h3>

                      <span className="text-[10px] font-medium text-gray-400">
                        {
                          dayGames.length
                        }{" "}
                        {dayGames.length ===
                        1
                          ? "game"
                          : "games"}
                      </span>
                    </div>

                    <div className="space-y-2.5 sm:space-y-3">
                      {dayGames.map(
                        renderGameCard
                      )}
                    </div>
                  </section>
                )
              )}

              {/* Empty filtered state */}
              {filteredLiveGames.length ===
                0 &&
                filteredUpcomingGames.length ===
                  0 && (
                  <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-6 text-center">
                    <p className="font-semibold text-gray-900">
                      No games in this view
                    </p>

                    <p className="mt-1 text-sm text-gray-500">
                      Try another filter.
                    </p>
                  </div>
                )}
            </div>
          )}
        </section>
      </div>

      {/* Sticky Bet Slip */}
      {selectedBet ? (
        <div className="fixed inset-x-0 bottom-0 z-50 border-t border-gray-200 bg-white/95 shadow-2xl backdrop-blur">
          <div className="mx-auto max-w-5xl px-3 py-3 sm:px-6 sm:py-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-5">

              {/* Selection */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-green-100 px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-green-700">
                    Bet Slip
                  </span>

                  <span className="text-[10px] font-bold text-gray-400">
                    1 Unit
                  </span>
                </div>

                <div className="mt-1 flex items-center gap-2">
                  <p className="truncate text-sm font-extrabold text-gray-900 sm:text-base">
                    {
                      selectedBet.pick
                    }
                  </p>

                  <span className="shrink-0 text-xs font-bold text-gray-500">
                    {selectedBet.betType ===
                    "Spread"
                      ? formatLine(
                          selectedBet.line
                        )
                      : selectedBet.betType ===
                        "Total"
                      ? selectedBet.line ??
                        "—"
                      : ""}
                  </span>

                  <span className="shrink-0 text-xs font-extrabold text-gray-900">
                    {formatOdds(
                      selectedBet.odds
                    )}
                  </span>
                </div>

                <p className="truncate text-[10px] font-medium text-gray-400">
                  {
                    selectedBet.game
                      .away_team
                  }{" "}
                  vs.{" "}
                  {
                    selectedBet.game
                      .home_team
                  }
                </p>

                {wagerMessage ? (
                  <p className="mt-1 text-[10px] font-bold text-red-600">
                    {
                      wagerMessage
                    }
                  </p>
                ) : null}
              </div>

              {/* Actions */}
              <div className="flex shrink-0 gap-2">
                <button
                  disabled={
                    placingWager
                  }
                  onClick={() => {
                    setSelectedBet(
                      null
                    );
                    setWagerMessage(
                      ""
                    );
                  }}
                  className="flex-1 rounded-xl border border-gray-200 bg-white px-4 py-3 text-xs font-extrabold text-gray-600 transition hover:bg-gray-50 sm:flex-none"
                >
                  Change
                </button>

                <button
                  disabled={
                    placingWager
                  }
                  onClick={
                    placeWager
                  }
                  className="flex-[2] rounded-xl bg-green-600 px-5 py-3 text-xs font-extrabold text-white shadow-sm transition hover:bg-green-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 sm:flex-none"
                >
                  {placingWager
                    ? "Placing..."
                    : "Confirm Wager"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}