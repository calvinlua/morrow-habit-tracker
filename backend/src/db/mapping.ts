import type { IsoDate } from "../utils/dates.js";

/**
 * Conversions between Prisma's column types and the domain's plain values.
 *
 * These are small enough to look unnecessary and important enough to be tested
 * on their own — both of them are places where a reasonable-looking one-liner
 * is subtly wrong.
 */

/**
 * A MySQL `DATE` column comes back from Prisma as a `Date` pinned to **UTC
 * midnight**, because a calendar date has no time or zone of its own. Reading
 * it with the local-time getters (`getDate()`, or `toLocaleDateString`) shifts
 * the day backwards for anyone west of UTC, which is exactly the off-by-one
 * that breaks a streak. The UTC slice is the correct read.
 */
export function toIsoDate(value: Date): IsoDate {
  return value.toISOString().slice(0, 10);
}

/** The inverse: a calendar date as the UTC-midnight instant Prisma expects. */
export function toDateColumn(date: IsoDate): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

/**
 * `DECIMAL` columns arrive as Prisma `Decimal` objects, which keep full
 * precision for values far larger than a habit target. Converting through
 * `toString` is deliberate: `Number(decimal)` happens to work via `valueOf`,
 * but relies on a coercion that is easy to break and easier to misread.
 */
export function toNumber(value: { toString(): string } | number): number {
  return typeof value === "number" ? value : Number(value.toString());
}
