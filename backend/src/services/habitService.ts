import { config } from "../config.js";
import { toDateColumn, toIsoDate, toNumber } from "../db/mapping.js";
import { prisma } from "../db/prisma.js";
import { isUniqueViolation } from "../db/prismaErrors.js";
import { FutureDateError, HabitNotFoundError } from "../errors/ruleErrors.js";
import type { Habit, HabitLog, HabitProgress } from "../types/habit.js";
import { addDays, startOfWeek, todayIn, type IsoDate } from "../utils/dates.js";
import {
  DAYS_PER_WEEK,
  STREAK_LOOKBACK_DAYS,
  buildHabitProgress,
} from "../utils/progress.js";

export interface CreateHabitDetails {
  name: string;
  unit: string;
  target: number;
}

export interface LogHabitDetails {
  habitId: number;
  /** Omitted means "I did the thing" — the habit's own target is recorded. */
  value?: number;
  /** Omitted means today. Present allows backfilling a missed day. */
  date?: IsoDate;
}

export interface DashboardView {
  today: IsoDate;
  timeZone: string;
  weekStart: IsoDate;
  weekEnd: IsoDate;
  summary: {
    habitCount: number;
    completedToday: number;
    longestCurrentStreak: number;
  };
  habits: HabitProgress[];
}

export interface LogHabitOutcome {
  status: "created" | "updated";
  date: IsoDate;
}

/**
 * What the application actually does, independent of how it was asked.
 *
 * Nothing here imports Express or knows what a status code is: the rules it
 * enforces — you may only touch your own habits, you may not log the future —
 * are expressed by throwing the errors in `errors/ruleErrors.ts`. The controller
 * translates HTTP, this decides behaviour and owns the queries.
 *
 * Rows are converted to domain values on the way out (`db/mapping.ts`), so a
 * Prisma `Decimal` or a UTC-midnight `Date` never escapes this file.
 */

/** The calendar date it is right now, in the timezone the app runs on. */
function today(): IsoDate {
  return todayIn(config.APP_TIMEZONE, new Date());
}

export async function listHabits(userId: string): Promise<Habit[]> {
  const rows = await prisma.habit.findMany({
    where: { userId, archivedAt: null },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  return rows.map(toDomainHabit);
}

export async function createHabit(userId: string, details: CreateHabitDetails): Promise<Habit> {
  const row = await prisma.habit.create({ data: { userId, ...details } });
  return toDomainHabit(row);
}

/**
 * The one read the dashboard makes: every habit with the current week's
 * progress, assembled in two queries regardless of how many habits exist.
 */
export async function getDashboard(userId: string): Promise<DashboardView> {
  const until = today();
  const weekStart = startOfWeek(until);
  const weekEnd = addDays(weekStart, DAYS_PER_WEEK - 1);
  // Reach back far enough to measure a streak, not just to fill the week.
  const since = addDays(until, -(STREAK_LOOKBACK_DAYS - 1));

  const [habits, logs] = await Promise.all([
    listHabits(userId),
    // Through the end of the week rather than today: a log backfilled before an
    // APP_TIMEZONE change can sit a day ahead, and the week should show it.
    listLogs(userId, since, weekEnd),
  ]);

  const progress = habits.map((habit) =>
    buildHabitProgress(habit, logs, { today: until, weekStart }),
  );

  return {
    today: until,
    timeZone: config.APP_TIMEZONE,
    weekStart,
    weekEnd,
    summary: {
      habitCount: progress.length,
      completedToday: progress.filter((habit) => habit.completedToday).length,
      longestCurrentStreak: progress.reduce(
        (longest, habit) => Math.max(longest, habit.currentStreak),
        0,
      ),
    },
    habits: progress,
  };
}

export async function logHabit(
  userId: string,
  details: LogHabitDetails,
): Promise<LogHabitOutcome> {
  // Ownership is checked here rather than folded into the write, so that a log
  // against someone else's habit is "no such habit" rather than a foreign key
  // error — and a stranger is never told that habit 812 exists.
  const habit = await findHabit(userId, details.habitId);
  if (!habit) throw new HabitNotFoundError(details.habitId);

  const date = details.date ?? today();
  if (date > today()) throw new FutureDateError();

  const status = await writeLog({
    userId,
    habitId: habit.id,
    date,
    value: details.value ?? habit.target,
  });

  return { status, date };
}

async function findHabit(userId: string, habitId: number): Promise<Habit | null> {
  const row = await prisma.habit.findFirst({
    where: { id: habitId, userId, archivedAt: null },
  });
  return row ? toDomainHabit(row) : null;
}

/** Logs for the user's habits from `since` to `until`, inclusive. */
async function listLogs(userId: string, since: IsoDate, until: IsoDate): Promise<HabitLog[]> {
  const rows = await prisma.habitLog.findMany({
    where: {
      userId,
      logDate: { gte: toDateColumn(since), lte: toDateColumn(until) },
    },
    select: { habitId: true, logDate: true, value: true },
  });

  return rows.map((row) => ({
    habitId: row.habitId,
    date: toIsoDate(row.logDate),
    value: toNumber(row.value),
  }));
}

/**
 * Insert first, and treat the unique-constraint violation as the answer.
 *
 * `upsert` would read before writing, leaving a window in which two
 * simultaneous taps both see no row and both try to insert. Here the database
 * decides the winner: whoever loses the race gets P2002 back and updates
 * instead. The constraint is doing the work, which is the whole reason it
 * exists — and it makes "created" versus "updated" exact rather than inferred
 * from an affected-row count.
 */
async function writeLog(input: {
  userId: string;
  habitId: number;
  date: IsoDate;
  value: number;
}): Promise<"created" | "updated"> {
  const logDate = toDateColumn(input.date);

  try {
    await prisma.habitLog.create({
      data: {
        habitId: input.habitId,
        userId: input.userId,
        logDate,
        value: input.value,
      },
    });
    return "created";
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;

    await prisma.habitLog.update({
      where: { habitId_logDate: { habitId: input.habitId, logDate } },
      data: { value: input.value, loggedAt: new Date() },
    });
    return "updated";
  }
}

function toDomainHabit(row: {
  id: number;
  userId: string;
  name: string;
  unit: string;
  target: { toString(): string };
}): Habit {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    unit: row.unit,
    target: toNumber(row.target),
  };
}
