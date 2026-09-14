/*
 * Vercel triggers the exact schedule in vercel.json (which is UTC only).
 * These values are a shared safety throttle for direct/retried requests.
 * Weekdays run morning and evening Pacific; weekends every three hours.
 */
export const WEEKDAY_SYNC_MINIMUM_MINUTES = 8 * 60;
export const WEEKEND_SYNC_MINIMUM_MINUTES = 2 * 60;

function getPacificWeekday() {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    weekday: "short",
  }).format(new Date());
}

export function isPacificWeekend() {
  const weekday = getPacificWeekday();
  return weekday === "Sat" || weekday === "Sun";
}

export function getSyncMinimumIntervalMinutes() {
  return isPacificWeekend()
    ? WEEKEND_SYNC_MINIMUM_MINUTES
    : WEEKDAY_SYNC_MINIMUM_MINUTES;
}

export function isSyncDue(lastRunAt: string | null) {
  if (!lastRunAt) return true;
  const lastRun = new Date(lastRunAt).getTime();
  if (Number.isNaN(lastRun)) return true;

  return Date.now() - lastRun >= getSyncMinimumIntervalMinutes() * 60 * 1000;
}
