import { useCallback, useEffect, useState } from "react";
import type { DashboardApi } from "./dashboardApi";
import type { Dashboard } from "./types";

interface DashboardState {
  data: Dashboard | null;
  loading: boolean;
  error: string | null;
}

/**
 * Loads the dashboard through `api` and exposes a `reload` for after a write.
 *
 * The server is the only thing that knows what a streak is now, so a write is
 * followed by a refetch rather than by patching the response client-side. It
 * costs one request and removes a whole category of "the number on screen
 * disagrees with the database" bug.
 *
 * The API object is a parameter rather than something this hook builds, so the
 * React state stays the only thing it owns. `api` must be stable across renders
 * (see App's `useMemo`) or the effect below refetches on every render.
 */
export function useDashboard(api: DashboardApi) {
  const [state, setState] = useState<DashboardState>({
    data: null,
    loading: true,
    error: null,
  });

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setState((previous) => ({ ...previous, loading: true, error: null }));
      try {
        const data = await api.load(signal);
        if (signal?.aborted) return;
        setState({ data, loading: false, error: null });
      } catch (error) {
        // An abort is a navigation, not a failure: leave the state alone so
        // the unmounting view does not flash an error on its way out.
        if (signal?.aborted) return;
        setState((previous) => ({
          ...previous,
          loading: false,
          error: error instanceof Error ? error.message : "Could not load your habits.",
        }));
      }
    },
    [api],
  );

  useEffect(() => {
    // Aborting on cleanup means a slow response for the previous user can
    // never land after a faster one for the current user.
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const reload = useCallback(() => load(), [load]);

  return { ...state, reload };
}
