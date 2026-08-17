import { describe, expect, it } from "vitest";
import { addDays, startOfWeek } from "../src/utils/dates.js";
import { STREAK_LOOKBACK_DAYS, buildHabitProgress } from "../src/utils/progress.js";
import type { Habit, HabitLog } from "../src/types/habit.js";

const TODAY = "2024-03-15"; // a Friday, so the week runs 03-11 (Mon) to 03-17 (Sun)
const WEEK_START = "2024-03-11";
const habit: Habit = { id: 1, userId: "u1", name: "Exercise", unit: "minutes", target: 30 };

/** Logs `value` on each of the given day offsets back from TODAY. */
function logsOn(offsets: number[], value = 30): HabitLog[] {
  return offsets.map((offset) => ({ habitId: habit.id, date: addDays(TODAY, -offset), value }));
}

const build = (logs: HabitLog[], today = TODAY) =>
  buildHabitProgress(habit, logs, { today, weekStart: startOfWeek(today) });

/** The cell for a given day, addressed by date rather than by position. */
const dayOf = (progress: ReturnType<typeof build>, date: string) =>
  progress.days.find((day) => day.date === date);

describe("weekly progress", () => {
  it("returns Monday to Sunday of the current week, oldest first", () => {
    const { days } = build([]);
    expect(days).toHaveLength(7);
    expect(days[0]?.date).toBe(WEEK_START);
    expect(days.at(-1)?.date).toBe("2024-03-17");
  });

  it("keeps the same week on the Sunday it ends", () => {
    const { days } = build([], "2024-03-17");
    expect(days[0]?.date).toBe(WEEK_START);
    expect(days.at(-1)?.date).toBe("2024-03-17");
    expect(days.every((day) => !day.isFuture)).toBe(true);
  });

  it("starts a new week on Monday rather than carrying the old one", () => {
    const { days } = build([], "2024-03-18");
    expect(days[0]?.date).toBe("2024-03-18");
    // Only Monday has happened; the other six are still ahead.
    expect(days.filter((day) => day.isFuture)).toHaveLength(6);
  });

  it("marks the rest of the week as future rather than as missed", () => {
    const progress = build([]);
    expect(dayOf(progress, TODAY)?.isFuture).toBe(false);
    expect(dayOf(progress, "2024-03-16")?.isFuture).toBe(true);
    expect(dayOf(progress, "2024-03-17")?.isFuture).toBe(true);
  });

  it("counts a day as complete only when the value reaches the target", () => {
    const progress = build([
      { habitId: 1, date: TODAY, value: 29 },
      { habitId: 1, date: addDays(TODAY, -1), value: 30 },
      { habitId: 1, date: addDays(TODAY, -2), value: 45 },
    ]);

    expect(dayOf(progress, TODAY)).toMatchObject({ value: 29, completed: false });
    expect(dayOf(progress, "2024-03-14")).toMatchObject({ value: 30, completed: true });
    expect(dayOf(progress, "2024-03-13")).toMatchObject({ value: 45, completed: true });
    expect(progress.completionRate).toBe(29); // 2 of 7
  });

  it("rates completion against the whole week, not the days elapsed", () => {
    // Monday and Tuesday done, on the Tuesday: 2 of 7, not 2 of 2.
    expect(build(logsOn([0, 1]), "2024-03-12").completionRate).toBe(29);
  });

  it("ignores logs belonging to another habit", () => {
    const progress = build([{ habitId: 99, date: TODAY, value: 100 }]);
    expect(dayOf(progress, TODAY)).toMatchObject({ value: 0, completed: false });
  });

  it("ignores last week's logs when computing this week's rate", () => {
    // Offsets 5 and 6 are Sunday and Saturday of the previous week.
    expect(build(logsOn([5, 6])).completionRate).toBe(0);
  });

  it("reports a partially logged day as not complete but still logged today", () => {
    const progress = build([{ habitId: 1, date: TODAY, value: 10 }]);
    expect(progress.loggedToday).toBe(true);
    expect(progress.completedToday).toBe(false);
    expect(dayOf(progress, TODAY)?.completed).toBe(false);
  });

  it("reports completedToday for today, not for the last cell in the week", () => {
    const progress = build(logsOn([0]));
    expect(progress.completedToday).toBe(true);
    // Sunday is the last cell and has not happened yet.
    expect(progress.days.at(-1)?.completed).toBe(false);
  });
});

describe("current streak", () => {
  it("counts consecutive completed days ending today", () => {
    expect(build(logsOn([0, 1, 2])).currentStreak).toBe(3);
  });

  it("keeps yesterday's streak alive while today is still in progress", () => {
    // The day is not over. Breaking the streak at 00:00 would punish the user
    // for a day they have not finished living.
    expect(build(logsOn([1, 2, 3])).currentStreak).toBe(3);
  });

  it("breaks once a full day has been missed", () => {
    expect(build(logsOn([2, 3, 4])).currentStreak).toBe(0);
  });

  it("counts only the run ending now, not the longest run in history", () => {
    expect(build(logsOn([0, 1, 4, 5, 6, 7])).currentStreak).toBe(2);
  });

  it("does not let an under-target day extend a streak", () => {
    const logs = [...logsOn([0, 2]), { habitId: 1, date: addDays(TODAY, -1), value: 5 }];
    expect(build(logs).currentStreak).toBe(1);
  });

  it("runs past the display window", () => {
    expect(build(logsOn([...Array(20).keys()])).currentStreak).toBe(20);
  });

  it("flags a streak that is only limited by how far back we looked", () => {
    const everyDay = logsOn([...Array(STREAK_LOOKBACK_DAYS + 5).keys()]);
    const progress = build(everyDay);
    expect(progress.currentStreak).toBe(STREAK_LOOKBACK_DAYS);
    expect(progress.streakTruncated).toBe(true);
  });

  it("does not flag truncation for an ordinary streak", () => {
    expect(build(logsOn([0, 1, 2])).streakTruncated).toBe(false);
  });
});
