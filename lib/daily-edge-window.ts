export const REPORTING_TIME_ZONE = "America/Los_Angeles";

export type WeeklyWindow = {
  start: Date;
  end: Date;
  startIso: string;
  endIso: string;
  label: string;
};

const pacificDateParts = new Intl.DateTimeFormat("en-US", {
  timeZone: REPORTING_TIME_ZONE,
  year: "numeric",
  month: "numeric",
  day: "numeric",
  weekday: "short",
});

const pacificDateTimeParts = new Intl.DateTimeFormat("en-US", {
  timeZone: REPORTING_TIME_ZONE,
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  second: "numeric",
  hourCycle: "h23",
});

function partsMap(formatter: Intl.DateTimeFormat, date: Date) {
  return Object.fromEntries(formatter.formatToParts(date).map(({ type, value }) => [type, value]));
}

function pacificMidnightUtc(year: number, month: number, day: number) {
  const targetWallTime = Date.UTC(year, month - 1, day, 0, 0, 0);
  let candidate = targetWallTime;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = partsMap(pacificDateTimeParts, new Date(candidate));
    const observedWallTime = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    );
    const correction = targetWallTime - observedWallTime;
    candidate += correction;
    if (correction === 0) break;
  }
  return new Date(candidate);
}

export function getPacificWeekWindow(now = new Date()): WeeklyWindow {
  const parts = partsMap(pacificDateParts, now);
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday);
  const mondayOffset = (weekday + 6) % 7;
  const pacificCalendarDate = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day) - mondayOffset));
  const year = pacificCalendarDate.getUTCFullYear();
  const month = pacificCalendarDate.getUTCMonth() + 1;
  const day = pacificCalendarDate.getUTCDate();
  const start = pacificMidnightUtc(year, month, day);
  const endDate = new Date(Date.UTC(year, month - 1, day + 7));
  const end = pacificMidnightUtc(endDate.getUTCFullYear(), endDate.getUTCMonth() + 1, endDate.getUTCDate());
  const labelStart = new Intl.DateTimeFormat("en-US", { timeZone: REPORTING_TIME_ZONE, month: "long", day: "numeric" }).format(start);
  const labelEnd = new Intl.DateTimeFormat("en-US", { timeZone: REPORTING_TIME_ZONE, month: "long", day: "numeric" }).format(new Date(end.getTime() - 1));
  return { start, end, startIso: start.toISOString(), endIso: end.toISOString(), label: `${labelStart} – ${labelEnd}` };
}

export function isWithinWeeklyWindow(value: string | Date, window: WeeklyWindow) {
  const timestamp = new Date(value).getTime();
  return timestamp >= window.start.getTime() && timestamp < window.end.getTime();
}

export function getCurrentCollegeSeasonStart(now = new Date()) {
  const parts = partsMap(pacificDateParts, now);
  const year = Number(parts.year);
  const month = Number(parts.month);
  const seasonYear = month >= 8 ? year : year - 1;
  return new Date(Date.UTC(seasonYear, 7, 1)).toISOString();
}
