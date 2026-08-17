/** The shapes the API returns. Mirrors backend/src/domain/types.ts. */

export interface DayProgress {
  date: string;
  value: number;
  completed: boolean;
  /** Later this week than today: empty because it hasn't happened yet. */
  isFuture: boolean;
}

export interface HabitProgress {
  id: number;
  name: string;
  unit: string;
  target: number;
  /** Monday to Sunday of the current week, oldest first. */
  days: DayProgress[];
  completionRate: number;
  currentStreak: number;
  streakTruncated: boolean;
  loggedToday: boolean;
  completedToday: boolean;
}

export interface Dashboard {
  today: string;
  timeZone: string;
  weekStart: string;
  weekEnd: string;
  summary: {
    habitCount: number;
    completedToday: number;
    longestCurrentStreak: number;
  };
  habits: HabitProgress[];
}

export interface NewHabit {
  name: string;
  unit: string;
  target: number;
}

export interface LogResult {
  /** "created" for a new day, "updated" when today was already logged. */
  status: string;
  date: string;
}
