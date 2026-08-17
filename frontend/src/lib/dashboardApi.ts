import { ApiClient } from "./apiClient";
import type { Dashboard, LogResult, NewHabit } from "./types";

/**
 * The dashboard's endpoints, in one object.
 *
 * Everything the feature can ask the server for lives here, so the components
 * name an intention (`logHabit`) rather than a URL and a method. Swapping the
 * transport — a different base URL, a stub in a test — is a constructor
 * argument rather than a change at every call site.
 */
export class DashboardApi {
  constructor(private readonly client: ApiClient) {}

  /** The usual case: talk to the real API as `userId`. */
  static forUser(userId: string): DashboardApi {
    return new DashboardApi(new ApiClient({ userId }));
  }

  load(signal?: AbortSignal): Promise<Dashboard> {
    return this.client.get<Dashboard>("/api/dashboard", signal);
  }

  logHabit(habitId: number): Promise<LogResult> {
    return this.client.post<LogResult>("/api/logs", { habitId });
  }

  createHabit(input: NewHabit): Promise<{ habit: { id: number } }> {
    return this.client.post("/api/habits", input);
  }
}
