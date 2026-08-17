import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axios, { type InternalAxiosRequestConfig } from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import type { Dashboard } from "./lib/types";
import { networkError, respondWith } from "./test/axiosStub";

/** Monday to Sunday of the week containing TODAY (a Friday). */
const WEEK = [
  "2024-03-11",
  "2024-03-12",
  "2024-03-13",
  "2024-03-14",
  "2024-03-15",
  "2024-03-16",
  "2024-03-17",
];
const TODAY = "2024-03-15";

/** The week with Wednesday and Thursday done and today still open. */
function week(todayValue: number): Dashboard["habits"][number]["days"] {
  return WEEK.map((date) => {
    const value = date === "2024-03-13" || date === "2024-03-14" ? 30 : 0;
    const own = date === TODAY ? todayValue : value;
    return { date, value: own, completed: own >= 30, isFuture: date > TODAY };
  });
}

function dashboard(overrides: Partial<Dashboard["habits"][number]> = {}): Dashboard {
  const habit = {
    id: 1,
    name: "Exercise",
    unit: "minutes",
    target: 30,
    days: week(0),
    completionRate: 29,
    currentStreak: 2,
    streakTruncated: false,
    loggedToday: false,
    completedToday: false,
    ...overrides,
  };

  return {
    today: TODAY,
    timeZone: "Asia/Singapore",
    weekStart: WEEK[0] as string,
    weekEnd: WEEK[6] as string,
    summary: { habitCount: 1, completedToday: 0, longestCurrentStreak: 2 },
    habits: [habit],
  };
}

const adapter = vi.fn();
const realAdapter = axios.defaults.adapter;

beforeEach(() => {
  adapter.mockReset();
  // App builds its own ApiClient, so there is nothing to inject into. Instances
  // created by axios.create() inherit whatever adapter the defaults carry at
  // that moment, and every instance here is created during render.
  axios.defaults.adapter = adapter;
});

afterEach(() => {
  axios.defaults.adapter = realAdapter;
});

/** The config the adapter saw for the nth request. */
function requestAt(index: number): InternalAxiosRequestConfig {
  return adapter.mock.calls[index]?.[0] as InternalAxiosRequestConfig;
}

describe("HabitDashboard", () => {
  it("renders each habit's streak and weekly progress", async () => {
    adapter.mockImplementation(respondWith(dashboard()));

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Exercise" })).toBeInTheDocument();

    const streak = screen.getByTitle("Consecutive days completed");
    expect(within(streak).getByText("2")).toBeInTheDocument();
    expect(screen.getByText("29% this week")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "29");
  });

  it("shows the week Monday to Sunday, with the days still to come marked", async () => {
    adapter.mockImplementation(respondWith(dashboard()));

    render(<App />);
    await screen.findByRole("heading", { name: "Exercise" });

    // The first listitem is the habit card; the rest are the seven day cells.
    const [, ...dayCells] = screen.getAllByRole("listitem");
    expect(dayCells).toHaveLength(7);
    expect(dayCells[0]).toHaveTextContent("Mar 11, 2024");
    expect(dayCells.at(-1)).toHaveTextContent("Mar 17, 2024");

    // Saturday and Sunday have not happened yet, so they are not misses.
    expect(screen.getAllByText(/still to come/)).toHaveLength(2);
  });

  it("fetches once on mount rather than on every render", async () => {
    adapter.mockImplementation(respondWith(dashboard()));

    render(<App />);
    await screen.findByRole("heading", { name: "Exercise" });

    // A missing dependency array here is the classic cause of a request loop:
    // each response sets state, which re-renders, which fetches again.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(adapter).toHaveBeenCalledTimes(1);
  });

  it("logs a habit and shows the refreshed numbers", async () => {
    const completedToday = dashboard({
      days: week(30),
      currentStreak: 3,
      completionRate: 43,
      loggedToday: true,
      completedToday: true,
    });

    adapter
      .mockImplementationOnce(respondWith(dashboard()))
      .mockImplementationOnce(respondWith({ status: "created", date: "2024-03-15" }, 201))
      .mockImplementationOnce(respondWith(completedToday));

    render(<App />);
    await userEvent.click(await screen.findByRole("button", { name: "Log today" }));

    expect(await screen.findByRole("button", { name: "Done today" })).toBeDisabled();
    expect(screen.getByText("43% this week")).toBeInTheDocument();

    const logCall = requestAt(1);
    expect(logCall.url).toBe("/api/logs");
    expect(JSON.parse(String(logCall.data))).toEqual({ habitId: 1 });
  });

  it("surfaces a failed log instead of pretending it worked", async () => {
    adapter
      .mockImplementationOnce(respondWith(dashboard()))
      .mockImplementationOnce(
        respondWith({ error: { message: "No habit 1 for this user." } }, 404),
      );

    render(<App />);
    await userEvent.click(await screen.findByRole("button", { name: "Log today" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("No habit 1 for this user.");
    // The button goes back to being usable rather than stuck on "Saving…".
    expect(screen.getByRole("button", { name: "Log today" })).toBeEnabled();
  });

  it("offers a retry when the dashboard cannot be loaded", async () => {
    adapter
      .mockImplementationOnce(networkError())
      .mockImplementationOnce(respondWith(dashboard()));

    render(<App />);

    const alert = await screen.findByRole("alert");
    await userEvent.click(within(alert).getByRole("button", { name: "Try again" }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Exercise" })).toBeInTheDocument();
    });
  });

  it("tells a new user what to do instead of showing an empty page", async () => {
    adapter.mockImplementation(
      respondWith({
        ...dashboard(),
        habits: [],
        summary: { habitCount: 0, completedToday: 0, longestCurrentStreak: 0 },
      }),
    );

    render(<App />);

    expect(await screen.findByText(/No habits yet/i)).toBeInTheDocument();
  });
});
