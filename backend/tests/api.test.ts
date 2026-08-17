import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addDays } from "../src/utils/dates.js";
import { createFakePrisma, type FakePrisma } from "./fakePrisma.js";

// The modules import their own dependencies, so substitution happens here: the
// database module is replaced wholesale, and the clock is frozen. `db` is
// reassigned per test, hence the getter — the mock is installed once, at import.
const stub = vi.hoisted(() => ({ client: undefined as unknown }));
vi.mock("../src/db/prisma.js", () => ({
  get prisma() {
    return stub.client;
  },
}));

const { createApp } = await import("../src/app.js");

// 17:00 UTC is already the next day in Singapore (APP_TIMEZONE in
// vitest.config.ts) — the fixed clock keeps the suite honest about which
// "today" the API is using.
const NOW = new Date("2024-03-14T17:00:00Z");
const TODAY = "2024-03-15"; // a Friday
const WEEK_START = "2024-03-11";
const WEEK_END = "2024-03-17";

let db: FakePrisma;
const app = createApp();

function agent() {
  return request(app);
}

beforeEach(() => {
  db = createFakePrisma({
    habits: [
      { userId: "alice", name: "Exercise", unit: "minutes", target: 30 },
      { userId: "bob", name: "Bob's habit", unit: "times", target: 1 },
    ],
  });
  stub.client = db.client;
  // Only Date: faking timers wholesale would stall supertest's sockets.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("authentication", () => {
  it("rejects an unidentified caller", async () => {
    const res = await agent().get("/api/dashboard");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("unauthorized");
  });

  it("leaves /health open", async () => {
    await agent().get("/health").expect(200, { status: "ok" });
  });
});

describe("GET /api/dashboard", () => {
  it("returns the caller's habits for the current Monday-to-Sunday week", async () => {
    const res = await agent().get("/api/dashboard").set("X-User-Id", "alice").expect(200);

    expect(res.body.today).toBe(TODAY);
    expect(res.body.weekStart).toBe(WEEK_START);
    expect(res.body.weekEnd).toBe(WEEK_END);
    expect(res.body.habits).toHaveLength(1);
    expect(res.body.habits[0].name).toBe("Exercise");

    const dates = res.body.habits[0].days.map((day: { date: string }) => day.date);
    expect(dates).toEqual([
      "2024-03-11",
      "2024-03-12",
      "2024-03-13",
      "2024-03-14",
      TODAY,
      "2024-03-16",
      "2024-03-17",
    ]);
    expect(res.body.summary).toEqual({
      habitCount: 1,
      completedToday: 0,
      longestCurrentStreak: 0,
    });
  });

  it("marks the days after today as future rather than missed", async () => {
    const res = await agent().get("/api/dashboard").set("X-User-Id", "alice").expect(200);
    const future = res.body.habits[0].days
      .filter((day: { isFuture: boolean }) => day.isFuture)
      .map((day: { date: string }) => day.date);

    expect(future).toEqual(["2024-03-16", "2024-03-17"]);
  });

  it("never leaks another user's habits", async () => {
    const res = await agent().get("/api/dashboard").set("X-User-Id", "bob").expect(200);
    expect(res.body.habits.map((h: { name: string }) => h.name)).toEqual(["Bob's habit"]);
  });

  it("reflects a log immediately in progress and streak", async () => {
    await agent()
      .post("/api/logs")
      .set("X-User-Id", "alice")
      .send({ habitId: 1, value: 45 })
      .expect(201);

    const res = await agent().get("/api/dashboard").set("X-User-Id", "alice").expect(200);
    const habit = res.body.habits[0];
    const today = habit.days.find((day: { date: string }) => day.date === TODAY);

    expect(today).toMatchObject({ value: 45, completed: true, isFuture: false });
    expect(habit.completedToday).toBe(true);
    expect(habit.currentStreak).toBe(1);
    expect(habit.completionRate).toBe(14);
    expect(res.body.summary.completedToday).toBe(1);
  });

  it("counts today, not the last cell of the week, as done today", async () => {
    // Regression: the summary and the log button both used days.at(-1), which
    // stopped being today the moment the strip started ending on Sunday.
    await agent().post("/api/logs").set("X-User-Id", "alice").send({ habitId: 1 }).expect(201);

    const res = await agent().get("/api/dashboard").set("X-User-Id", "alice").expect(200);
    expect(res.body.habits[0].days.at(-1).completed).toBe(false);
    expect(res.body.summary.completedToday).toBe(1);
  });
});

describe("POST /api/habits", () => {
  it("creates a habit for the caller", async () => {
    const res = await agent()
      .post("/api/habits")
      .set("X-User-Id", "alice")
      .send({ name: "  Meditate  ", unit: "minutes", target: 10 })
      .expect(201);

    expect(res.body.habit).toMatchObject({ name: "Meditate", target: 10, userId: "alice" });
    expect(db.habitCount("alice")).toBe(2);
  });

  it("defaults unit and target for a simple yes/no habit", async () => {
    const res = await agent()
      .post("/api/habits")
      .set("X-User-Id", "alice")
      .send({ name: "Floss" })
      .expect(201);
    expect(res.body.habit).toMatchObject({ unit: "times", target: 1 });
  });

  it.each([
    ["an empty name", { name: "   " }],
    ["a zero target", { name: "Walk", target: 0 }],
    ["a negative target", { name: "Walk", target: -5 }],
  ])("rejects %s", async (_label, body) => {
    const res = await agent()
      .post("/api/habits")
      .set("X-User-Id", "alice")
      .send(body)
      .expect(400);
    expect(res.body.error.code).toBe("bad_request");
  });
});

describe("POST /api/logs", () => {
  it("defaults to today and to the habit's target", async () => {
    const res = await agent()
      .post("/api/logs")
      .set("X-User-Id", "alice")
      .send({ habitId: 1 })
      .expect(201);

    expect(res.body).toEqual({ status: "created", date: TODAY });
    expect(db.logs()).toEqual([{ habitId: 1, date: TODAY, value: 30 }]);
  });

  it("is idempotent for the same day", async () => {
    const send = () =>
      agent().post("/api/logs").set("X-User-Id", "alice").send({ habitId: 1, value: 30 });

    await send().expect(201);
    const second = await send().expect(200);

    expect(second.body.status).toBe("updated");
    expect(db.logs()).toHaveLength(1);
  });

  it("backfills a past day", async () => {
    const yesterday = addDays(TODAY, -1);
    await agent()
      .post("/api/logs")
      .set("X-User-Id", "alice")
      .send({ habitId: 1, date: yesterday })
      .expect(201);

    const res = await agent().get("/api/dashboard").set("X-User-Id", "alice").expect(200);
    expect(res.body.habits[0].currentStreak).toBe(1);
  });

  it("refuses a future day", async () => {
    const res = await agent()
      .post("/api/logs")
      .set("X-User-Id", "alice")
      .send({ habitId: 1, date: addDays(TODAY, 1) })
      .expect(400);
    expect(res.body.error.message).toMatch(/future/i);
  });

  it("refuses a malformed date", async () => {
    await agent()
      .post("/api/logs")
      .set("X-User-Id", "alice")
      .send({ habitId: 1, date: "15-03-2024" })
      .expect(400);
  });

  it("cannot log against another user's habit", async () => {
    const res = await agent()
      .post("/api/logs")
      .set("X-User-Id", "alice")
      .send({ habitId: 2 })
      .expect(404);
    expect(res.body.error.code).toBe("not_found");
  });
});

describe("error handling", () => {
  it("returns a generic 500 and no stack trace when a query fails", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    db.breakWith(new Error("connection lost: SELECT * FROM habits"));

    const res = await agent().get("/api/dashboard").set("X-User-Id", "alice").expect(500);

    expect(res.body).toEqual({
      error: { code: "internal_error", message: "Something went wrong." },
    });
    expect(JSON.stringify(res.body)).not.toMatch(/SELECT|stack/i);
    expect(logged).toHaveBeenCalledOnce(); // the detail went to the log instead
  });

  it("404s an unknown route", async () => {
    await agent().get("/api/nope").set("X-User-Id", "alice").expect(404);
  });

  it("reports which field a schema rejected", async () => {
    // The ZodError is thrown by schema.parse in the controller and translated
    // by the error handler, so the client still gets the offending field.
    const res = await agent()
      .post("/api/habits")
      .set("X-User-Id", "alice")
      .send({ name: "Walk", target: -5 })
      .expect(400);

    expect(res.body.error.code).toBe("bad_request");
    expect(res.body.error.details).toContainEqual({
      field: "target",
      message: "Target must be greater than zero.",
    });
  });

  it("never sends a success body when the service throws", async () => {
    // The controllers have no try/catch: the guarantee is that a rejected
    // promise stops the handler at the `await`, so the `res.json(outcome)`
    // line below it cannot run on a half-finished write.
    vi.spyOn(console, "error").mockImplementation(() => {});
    db.breakWith(new Error("deadlock found when trying to get lock"));

    const res = await agent()
      .post("/api/logs")
      .set("X-User-Id", "alice")
      .send({ habitId: 1 })
      .expect(500);

    expect(res.body).toEqual({
      error: { code: "internal_error", message: "Something went wrong." },
    });
    expect(res.body).not.toHaveProperty("status");
    expect(res.body).not.toHaveProperty("date");
  });
});
