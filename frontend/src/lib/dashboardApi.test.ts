import { CanceledError, type InternalAxiosRequestConfig } from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { networkError, respondWith } from "../test/axiosStub";
import { ApiClient, ApiError } from "./apiClient";
import { DashboardApi } from "./dashboardApi";

/**
 * Stands in for the network. Only the adapter is replaced, so the axios
 * instance ApiClient builds — base URL, headers, JSON handling — is exercised
 * exactly as it is in the browser.
 */
const adapter = vi.fn();

function api(): DashboardApi {
  return new DashboardApi(new ApiClient({ userId: "alice", adapter }));
}

/** Answers the next request with `data` and `status`. */
function answer(data: unknown, status = 200) {
  adapter.mockImplementation(respondWith(data, status));
}

/** The config the adapter was called with on the first request. */
function sentConfig(): InternalAxiosRequestConfig {
  return adapter.mock.calls[0]?.[0] as InternalAxiosRequestConfig;
}

beforeEach(() => {
  adapter.mockReset();
});

describe("DashboardApi", () => {
  it("identifies the caller on every request", async () => {
    answer({ habits: [] });

    await api().load();

    const config = sentConfig();
    expect(config.url).toBe("/api/dashboard");
    expect(config.method).toBe("get");
    expect(config.headers["X-User-Id"]).toBe("alice");
  });

  it("returns the response body rather than the axios envelope", async () => {
    answer({ today: "2024-03-15", habits: [] });
    await expect(api().load()).resolves.toMatchObject({ today: "2024-03-15" });
  });

  it("passes an abort signal through to axios", async () => {
    answer({ habits: [] });
    const controller = new AbortController();

    await api().load(controller.signal);

    expect(sentConfig().signal).toBe(controller.signal);
  });

  it("posts the habit id when logging", async () => {
    answer({ status: "created", date: "2024-03-15" }, 201);

    await expect(api().logHabit(7)).resolves.toMatchObject({ status: "created" });

    const config = sentConfig();
    expect(config.url).toBe("/api/logs");
    expect(config.method).toBe("post");
    expect(JSON.parse(String(config.data))).toEqual({ habitId: 7 });
  });

  it("sends a new habit as JSON", async () => {
    answer({ habit: { id: 3 } }, 201);

    await api().createHabit({ name: "Read", unit: "pages", target: 20 });

    const config = sentConfig();
    expect(config.url).toBe("/api/habits");
    expect(JSON.parse(String(config.data))).toEqual({
      name: "Read",
      unit: "pages",
      target: 20,
    });
  });
});

describe("ApiClient error handling", () => {
  it("throws the server's message, not axios's status line", async () => {
    // Axios would report "Request failed with status code 404" and bury the
    // explanation in response.data, which is no use to a user.
    answer({ error: { message: "No habit 7 for this user." } }, 404);

    await expect(api().logHabit(7)).rejects.toBeInstanceOf(ApiError);
    await expect(api().logHabit(7)).rejects.toThrow("No habit 7 for this user.");
  });

  it("falls back to the status when the error body carries no message", async () => {
    answer("<html>502 Bad Gateway</html>", 502);
    await expect(api().load()).rejects.toThrow("Request failed with status 502.");
  });

  it("explains a request that never reached the server", async () => {
    adapter.mockImplementation(networkError());

    await expect(api().load()).rejects.toThrow(/Could not reach the server/);
  });

  it("rethrows a cancellation instead of dressing it up as a failure", async () => {
    adapter.mockImplementation(() => Promise.reject(new CanceledError()));

    // useDashboard tells an abort apart from an error by its own signal, but a
    // cancellation must not arrive as an ApiError worth showing to the user.
    await expect(api().load()).rejects.toBeInstanceOf(CanceledError);
    await expect(api().load()).rejects.not.toBeInstanceOf(ApiError);
  });
});
