import { addDays, daysStartingAt, type IsoDate } from "./dates.js";
import type { DayProgress, Habit, HabitLog, HabitProgress } from "../types/habit.js";

/**
 * How far back a streak is counted. A streak that reaches the edge of this
 * window is reported as truncated rather than silently cut short, so the UI
 * can say "90+" instead of lying about a number it cannot know.
 */
export const STREAK_LOOKBACK_DAYS = 90;

/** The dashboard strip is one calendar week, Monday to Sunday. */
export const DAYS_PER_WEEK = 7;

export interface ProgressOptions {
  /** The user's today. The streak is measured backwards from here. */
  today: IsoDate;
  /** Monday of the week being displayed; `today` falls inside it. */
  weekStart: IsoDate;
}

/**
 * Turn one habit and its logs into the numbers the dashboard renders.
 *
 * `logs` may cover more days than the displayed week — the extra history is
 * what makes a streak longer than a week possible — and may contain days with
 * no entry at all, which simply count as zero.
 */
export function buildHabitProgress(
  habit: Habit,
  logs: readonly HabitLog[],
  { today, weekStart }: ProgressOptions,
): HabitProgress {
  const valueByDate = new Map<IsoDate, number>();
  for (const log of logs) {
    if (log.habitId !== habit.id) continue;
    // Defensive: the unique index means one row per day, but a future
    // "log twice in a day" feature should accumulate rather than overwrite.
    valueByDate.set(log.date, (valueByDate.get(log.date) ?? 0) + log.value);
  }

  const isCompleted = (date: IsoDate) => (valueByDate.get(date) ?? 0) >= habit.target;

  const days: DayProgress[] = daysStartingAt(weekStart, DAYS_PER_WEEK).map((date) => ({
    date,
    value: valueByDate.get(date) ?? 0,
    completed: isCompleted(date),
    // A day still to come is empty for the same reason every future day is.
    // Saying so lets the UI grey it out instead of drawing it as a miss.
    isFuture: date > today,
  }));

  const completedThisWeek = days.filter((day) => day.completed).length;
  const { streak, truncated } = countStreak(isCompleted, today);

  return {
    ...habit,
    days,
    // Out of the whole week, not the days elapsed so far: the label says "this
    // week", and a bar that fills as the week goes is the honest reading.
    completionRate: Math.round((completedThisWeek / DAYS_PER_WEEK) * 100),
    currentStreak: streak,
    streakTruncated: truncated,
    loggedToday: valueByDate.has(today),
    completedToday: isCompleted(today),
  };
}

/**
 * Consecutive completed days ending today.
 *
 * Today is treated as a grace day: a streak built up to yesterday still counts
 * while today is in progress, because a day the user has not finished living
 * is not yet a day they failed. Today only *adds* to the streak once it is
 * actually completed.
 */
function countStreak(
  isCompleted: (date: IsoDate) => boolean,
  today: IsoDate,
): { streak: number; truncated: boolean } {
  let streak = 0;
  let cursor = isCompleted(today) ? today : addDays(today, -1);

  for (let counted = 0; counted < STREAK_LOOKBACK_DAYS; counted++) {
    if (!isCompleted(cursor)) return { streak, truncated: false };
    streak++;
    cursor = addDays(cursor, -1);
  }

  return { streak, truncated: true };
}
