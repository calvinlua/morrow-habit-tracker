import { useMemo, useState } from "react";
import { AddHabitForm } from "./components/AddHabitForm";
import { HabitCard } from "./components/HabitCard";
import { DashboardApi } from "./lib/dashboardApi";
import type { NewHabit } from "./lib/types";
import { useDashboard } from "./lib/useDashboard";

/**
 * Which user we are looking at. Real sign-in is out of scope for this slice
 * (see the README); `?user=` makes the multi-user behaviour demonstrable.
 */
function currentUserId(): string {
  return (
    new URLSearchParams(window.location.search).get("user")?.trim() ||
    "demo-user"
  );
}

export default function App() {
  const userId = currentUserId();
  // One API object per user, not per render: `useDashboard` refetches whenever
  // this identity changes, which is exactly when the user does.
  const api = useMemo(() => DashboardApi.forUser(userId), [userId]);
  const { data, loading, error, reload } = useDashboard(api);
  // Per-habit rather than a single global flag, so logging one habit does not
  // put every other button into a saving state.
  const [pendingIds, setPendingIds] = useState<ReadonlySet<number>>(new Set());
  const [actionError, setActionError] = useState<string | null>(null);

  const handleLog = async (habitId: number) => {
    setActionError(null);
    setPendingIds((previous) => new Set(previous).add(habitId));
    try {
      await api.logHabit(habitId);
      await reload();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Could not save that log.",
      );
    } finally {
      setPendingIds((previous) => {
        const next = new Set(previous);
        next.delete(habitId);
        return next;
      });
    }
  };

  const handleCreate = async (input: NewHabit) => {
    setActionError(null);
    try {
      await api.createHabit(input);
      await reload();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Could not add that habit.",
      );
    }
  };

  return (
    <main>
      <header className="page-head">
        <div>
          <h1>Habits</h1>
          <p className="subtitle">
            {data ? `${formatToday(data.today)} · ${data.timeZone}` : " "}
          </p>
        </div>
        {data && (
          <dl className="summary">
            <div>
              <dt>Done today</dt>
              <dd>
                {data.summary.completedToday}/{data.summary.habitCount}
              </dd>
            </div>
            <div>
              <dt>Best streak</dt>
              <dd>{data.summary.longestCurrentStreak}</dd>
            </div>
          </dl>
        )}
      </header>

      <AddHabitForm onCreate={handleCreate} />

      {actionError && (
        <p className="banner banner--error" role="alert">
          {actionError}
        </p>
      )}

      {error ? (
        <div className="banner banner--error" role="alert">
          <p>{error}</p>
          <button type="button" onClick={() => void reload()}>
            Try again
          </button>
        </div>
      ) : loading && !data ? (
        <p className="banner">Loading your habits…</p>
      ) : data && data.habits.length === 0 ? (
        <p className="banner">
          No habits yet. Add one above to start a streak.
        </p>
      ) : (
        <ul className="habit-list">
          {data?.habits.map((habit) => (
            // Keyed by id, not index: cards keep their identity when the list
            // is reordered or filtered.
            <HabitCard
              key={habit.id}
              habit={habit}
              onLog={(id) => handleLog(id)}
              pending={pendingIds.has(habit.id)}
            />
          ))}
        </ul>
      )}
    </main>
  );
}

function formatToday(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, { dateStyle: "full" }).format(
    new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1, 12),
  );
}
