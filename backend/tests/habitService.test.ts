import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FutureDateError, HabitNotFoundError } from "../src/errors/ruleErrors.js";
import { addDays } from "../src/utils/dates.js";
import { createFakePrisma } from "./fakePrisma.js";

// The service imports the Prisma client, so the client module is what gets
// replaced. `stub.client` is reassigned per test; the getter keeps the module
// binding pointing at the current one.
const stub = vi.hoisted(() => ({ client: undefined as unknown }));
vi.mock("../src/db/prisma.js", () => ({
  get prisma() {
    return stub.client;
  },
}));

const service = await import("../src/services/habitService.js");

const TIMEZONE = "Asia/Singapore";
// 17:00 UTC is already the next day in Singapore, which is the whole point of
// resolving "today" through the service's timezone rather than the server's.
const NOW = new Date("2024-03-14T17:00:00Z");
const TODAY = "2024-03-15"; // a Friday

beforeEach(() => {
  const db = createFakePrisma({
    habits: [
      { userId: "alice", name: "Exercise", unit: "minutes", target: 30 },
      { userId: "bob", name: "Bob's habit", unit: "times", target: 1 },
    ],
  });
  stub.client = db.client;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("logHabit", () => {
  it("records the habit's own target when no value is given", async () => {
    await expect(service.logHabit("alice", { habitId: 1 })).resolves.toEqual({
      status: "created",
      date: TODAY,
    });

    const { habits } = await service.getDashboard("alice");
    expect(habits[0]?.days.find((day: { date: string }) => day.date === TODAY)?.value).toBe(30);
  });

  it("reports the second log of a day as an update, not a second row", async () => {
    await service.logHabit("alice", { habitId: 1 });
    await expect(service.logHabit("alice", { habitId: 1, value: 45 })).resolves.toMatchObject({
      status: "updated",
    });
  });

  it("refuses a habit belonging to someone else", async () => {
    // Not "forbidden": telling a stranger that habit 2 exists is itself a leak.
    await expect(service.logHabit("alice", { habitId: 2 })).rejects.toBeInstanceOf(
      HabitNotFoundError,
    );
  });

  it("refuses a future date but allows backfilling a past one", async () => {
    await expect(
      service.logHabit("alice", { habitId: 1, date: addDays(TODAY, 1) }),
    ).rejects.toBeInstanceOf(FutureDateError);

    await expect(
      service.logHabit("alice", { habitId: 1, date: addDays(TODAY, -1) }),
    ).resolves.toMatchObject({ status: "created" });
  });

  it("resolves today in the configured timezone, not the server's", async () => {
    // NOW is still 2024-03-14 in UTC; in Singapore it is already the 15th.
    const { date } = await service.logHabit("alice", { habitId: 1 });
    expect(date).toBe(TODAY);
  });
});

describe("getDashboard", () => {
  it("returns only the caller's habits", async () => {
    const { habits } = await service.getDashboard("bob");
    expect(habits.map((habit: { name: string }) => habit.name)).toEqual(["Bob's habit"]);
  });

  it("summarises the week without any HTTP involved", async () => {
    await service.logHabit("alice", { habitId: 1 });
    await service.logHabit("alice", { habitId: 1, date: addDays(TODAY, -1) });

    const dashboard = await service.getDashboard("alice");

    expect(dashboard.today).toBe(TODAY);
    expect(dashboard.weekStart).toBe("2024-03-11");
    expect(dashboard.weekEnd).toBe("2024-03-17");
    expect(dashboard.summary).toEqual({
      habitCount: 1,
      completedToday: 1,
      longestCurrentStreak: 2,
    });
  });
});
