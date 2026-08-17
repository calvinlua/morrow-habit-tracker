import type { HabitProgress } from "../lib/types";
import { WeekStrip } from "./WeekStrip";

interface HabitCardProps {
  habit: HabitProgress;
  onLog: (habitId: number) => void;
  pending: boolean;
}

export function HabitCard({ habit, onLog, pending }: HabitCardProps) {
  const streakLabel = habit.streakTruncated ? `${habit.currentStreak}+` : habit.currentStreak;

  return (
    <li className="card">
      <div className="card__head">
        <div>
          <h2>{habit.name}</h2>
          <p className="card__target">
            Target: {habit.target} {habit.unit} a day
          </p>
        </div>
        <div className="streak" title="Consecutive days completed">
          <span className="streak__value">{streakLabel}</span>
          <span className="streak__label">day streak</span>
        </div>
      </div>

      <WeekStrip days={habit.days} unit={habit.unit} />

      <div className="card__foot">
        <div
          className="progress"
          role="progressbar"
          aria-valuenow={habit.completionRate}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${habit.name} weekly completion`}
        >
          <div className="progress__fill" style={{ width: `${habit.completionRate}%` }} />
        </div>
        <span className="card__rate">{habit.completionRate}% this week</span>

        <button
          type="button"
          onClick={() => onLog(habit.id)}
          disabled={pending || habit.completedToday}
        >
          {habit.completedToday ? "Done today" : pending ? "Saving…" : "Log today"}
        </button>
      </div>
    </li>
  );
}
