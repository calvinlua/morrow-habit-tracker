import axios, { type AxiosAdapter, type AxiosInstance } from "axios";

export class ApiError extends Error {}

export interface ApiClientOptions {
  /** Sent as X-User-Id. Stands in for a session token; see the README. */
  userId: string;
  /** Same-origin by default, so the Vite proxy handles it in development. */
  baseUrl?: string;
  /**
   * Replaces the layer that actually performs the request. Injected in tests
   * so the instance below — its base URL and headers — is the thing under
   * test, rather than being replaced along with the network.
   */
  adapter?: AxiosAdapter;
}

/**
 * The transport: one place that knows about headers, JSON and failure.
 *
 * Axios throws on a non-2xx by itself, which is the behaviour we want, but it
 * throws an `AxiosError` whose `message` is "Request failed with status code
 * 404" — the server's own explanation is buried in `response.data`. This class
 * digs it out and rethrows a plain `ApiError`, so nothing above it has to know
 * which HTTP library is underneath. It knows no endpoints: what the paths mean
 * is `DashboardApi`'s business.
 */
export class ApiClient {
  private readonly http: AxiosInstance;

  constructor({ userId, baseUrl = "", adapter }: ApiClientOptions) {
    this.http = axios.create({
      baseURL: baseUrl,
      headers: {
        "Content-Type": "application/json",
        "X-User-Id": userId,
      },
      ...(adapter ? { adapter } : {}),
    });
  }

  // GET REQUEST
  get<T>(path: string, signal?: AbortSignal): Promise<T> {
    return this.request<T>({ method: "GET", url: path, signal });
  }

  // POST REQUEST
  post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
    return this.request<T>({ method: "POST", url: path, data: body, signal });
  }

  private async request<T>(config: Parameters<AxiosInstance["request"]>[0]): Promise<T> {
    try {
      const res = await this.http.request<T>(config);
      return res.data;
    } catch (error) {
      // An abort is the caller's own doing — rethrow it as-is so the hook can
      // tell "I navigated away" apart from "the request failed".
      if (axios.isCancel(error)) throw error;
      throw new ApiError(this.errorMessage(error));
    }
  }

  private errorMessage(error: unknown): string {
    if (!axios.isAxiosError(error)) {
      return error instanceof Error ? error.message : "Something went wrong.";
    }

    // No response at all: DNS, connection refused, CORS, offline.
    if (!error.response) {
      return "Could not reach the server. Check your connection and try again.";
    }

    const body = error.response.data as { error?: { message?: string } } | string | undefined;
    const message = typeof body === "object" ? body?.error?.message : undefined;
    return message ?? `Request failed with status ${error.response.status}.`;
  }
}
