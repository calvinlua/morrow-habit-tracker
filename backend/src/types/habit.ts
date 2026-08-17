import type { IsoDate } from "../utils/dates.js";

export interface Habit {
  id: number;
  userId: string;
  name: string;
  unit: string;
  target: number;
}

export interface HabitLog {
  habitId: number;
  date: IsoDate;
  value: number;
}

export interface DayProgress {
  date: IsoDate;
  value: number;
  completed: boolean;
  isFuture: boolean; /** Later this week than today: nothing to log yet, so not a missed day. */
}

export interface HabitProgress extends Habit {
  days: DayProgress[]; /** Monday to Sunday of the week containing today, oldest first. */
  completionRate: number; /** Days completed this week, as a percentage of the seven-day week. */
  currentStreak: number; /** True when the streak is only capped by how far back we looked. */
  streakTruncated: boolean;
  loggedToday: boolean;
  completedToday: boolean; /** Today's value reached the target. Not the same as `loggedToday`. */
}
