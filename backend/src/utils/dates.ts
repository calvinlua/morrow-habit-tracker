/**
 * Calendar-day helpers.
 *
 * Everything in this service talks about days as `YYYY-MM-DD` strings rather
 * than `Date` objects. A habit is logged *on a day*, and a day only exists
 * relative to a timezone — the moment you let a `Date` represent one, you have
 * to remember which of its two meanings you meant, and the answer to "did I
 * log today?" quietly changes at whatever hour the server happens to sit at.
 */

export type IsoDate = string; // YYYY-MM-DD

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string): value is IsoDate {
  if (!ISO_DATE.test(value)) return false;
  // Rejects 2024-02-30 and friends, which the regex alone happily accepts.
  return toUtcMillis(value) !== null;
}

/** The calendar date it currently is in `timeZone`. */
export function todayIn(timeZone: string, now: Date = new Date()): IsoDate {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** `date` shifted by `days` (negative goes backwards). */
export function addDays(date: IsoDate, days: number): IsoDate {
  const millis = toUtcMillis(date);
  if (millis === null) throw new RangeError(`Not a calendar date: ${date}`);
  return fromUtcMillis(millis + days * 86_400_000);
}

/** Whole days from `from` to `to`; negative when `to` is earlier. */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  const a = toUtcMillis(from);
  const b = toUtcMillis(to);
  if (a === null || b === null) throw new RangeError("Not a calendar date");
  return Math.round((b - a) / 86_400_000);
}

/** `count` consecutive dates starting at `startDate`, oldest first. */
export function daysStartingAt(startDate: IsoDate, count: number): IsoDate[] {
  const days: IsoDate[] = [];
  for (let offset = 0; offset < count; offset++) {
    days.push(addDays(startDate, offset));
  }
  return days;
}

/**
 * The Monday of the week containing `date`.
 *
 * Weeks run Monday–Sunday (ISO-8601), which is what the dashboard strip shows.
 * `getUTCDay` is safe here because the date has already been resolved to a
 * calendar day in the user's timezone — this is arithmetic on that day, not a
 * second conversion.
 */
export function startOfWeek(date: IsoDate): IsoDate {
  const millis = toUtcMillis(date);
  if (millis === null) throw new RangeError(`Not a calendar date: ${date}`);
  // getUTCDay is 0 for Sunday; shift so Monday is 0 and Sunday is 6.
  const dayIndex = (new Date(millis).getUTCDay() + 6) % 7;
  return addDays(date, -dayIndex);
}

/**
 * Midnight UTC for a calendar date, or null if the string does not name a real
 * one. UTC throughout: these values are only ever compared against each other,
 * so the arithmetic stays free of DST-shortened days.
 */
function toUtcMillis(date: string): number | null {
  const match = ISO_DATE.exec(date);
  if (!match) return null;

  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  const millis = Date.UTC(year, month - 1, day);

  // Date.UTC rolls overflow forward (Feb 30 -> Mar 1), so round-trip to check.
  return fromUtcMillis(millis) === date ? millis : null;
}

function fromUtcMillis(millis: number): IsoDate {
  return new Date(millis).toISOString().slice(0, 10);
}
