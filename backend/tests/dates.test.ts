import { describe, expect, it } from "vitest";
import {
  addDays,
  daysBetween,
  daysStartingAt,
  isIsoDate,
  startOfWeek,
  todayIn,
} from "../src/utils/dates.js";

describe("todayIn", () => {
  it("resolves the day in the given timezone, not the server's", () => {
    // 22:30 UTC on the 5th is already the 6th in Tokyo and still the 5th in
    // New York. This is the bug that makes "log today" record yesterday.
    const instant = new Date("2024-03-05T22:30:00Z");
    expect(todayIn("Asia/Tokyo", instant)).toBe("2024-03-06");
    expect(todayIn("UTC", instant)).toBe("2024-03-05");
    expect(todayIn("America/New_York", instant)).toBe("2024-03-05");
  });

  it("pads single-digit months and days", () => {
    expect(todayIn("UTC", new Date("2024-01-02T12:00:00Z"))).toBe("2024-01-02");
  });
});

describe("addDays", () => {
  it("crosses month and year boundaries", () => {
    expect(addDays("2024-01-31", 1)).toBe("2024-02-01");
    expect(addDays("2024-12-31", 1)).toBe("2025-01-01");
    expect(addDays("2024-03-01", -1)).toBe("2024-02-29");
  });

  it("is unaffected by daylight saving transitions", () => {
    // Clocks in Berlin jump forward on 2024-03-31, so a naive local-time
    // implementation loses an hour and can land back on the same date.
    expect(addDays("2024-03-30", 1)).toBe("2024-03-31");
    expect(addDays("2024-03-31", 1)).toBe("2024-04-01");
  });

  it("rejects dates that do not exist", () => {
    expect(() => addDays("2023-02-29", 1)).toThrow(RangeError);
  });
});

describe("isIsoDate", () => {
  it.each(["2024-02-29", "2024-12-31"])("accepts %s", (date) => {
    expect(isIsoDate(date)).toBe(true);
  });

  it.each(["2023-02-29", "2024-13-01", "2024-1-1", "not-a-date", ""])(
    "rejects %s",
    (date) => {
      expect(isIsoDate(date)).toBe(false);
    },
  );
});

describe("daysBetween / daysStartingAt", () => {
  it("counts whole days in both directions", () => {
    expect(daysBetween("2024-03-01", "2024-03-08")).toBe(7);
    expect(daysBetween("2024-03-08", "2024-03-01")).toBe(-7);
  });

  it("returns a window starting at the given day, oldest first", () => {
    expect(daysStartingAt("2024-03-01", 3)).toEqual([
      "2024-03-01",
      "2024-03-02",
      "2024-03-03",
    ]);
  });
});

describe("startOfWeek", () => {
  it("returns the Monday of the week containing the date", () => {
    // 2024-03-11 is a Monday; 03-17 is the Sunday that closes the same week.
    expect(startOfWeek("2024-03-11")).toBe("2024-03-11");
    expect(startOfWeek("2024-03-15")).toBe("2024-03-11");
    expect(startOfWeek("2024-03-17")).toBe("2024-03-11");
  });

  it("treats Sunday as the end of the week, not the start", () => {
    // The off-by-one that turns a Sunday into a week of its own.
    expect(startOfWeek("2024-03-18")).toBe("2024-03-18");
    expect(startOfWeek("2024-03-17")).not.toBe("2024-03-17");
  });

  it("crosses month and year boundaries", () => {
    expect(startOfWeek("2024-03-01")).toBe("2024-02-26");
    expect(startOfWeek("2025-01-01")).toBe("2024-12-30");
  });

  it("rejects a date that does not exist", () => {
    expect(() => startOfWeek("2023-02-29")).toThrow(RangeError);
  });
});
