import { describe, expect, it } from "vitest";
import { toDateColumn, toIsoDate, toNumber } from "../src/db/mapping.js";

describe("DATE column mapping", () => {
  it("round-trips a calendar date", () => {
    expect(toIsoDate(toDateColumn("2024-03-15"))).toBe("2024-03-15");
  });

  it("writes a date as UTC midnight", () => {
    expect(toDateColumn("2024-03-15").toISOString()).toBe("2024-03-15T00:00:00.000Z");
  });

  it("reads the stored day, not the local one", () => {
    // What Prisma hands back for a DATE column. Read with local-time getters on
    // a machine west of UTC this is the 14th, and every streak is off by one.
    const fromDatabase = new Date("2024-03-15T00:00:00.000Z");
    expect(toIsoDate(fromDatabase)).toBe("2024-03-15");
  });

  it("survives a leap day and a year boundary", () => {
    expect(toIsoDate(toDateColumn("2024-02-29"))).toBe("2024-02-29");
    expect(toIsoDate(toDateColumn("2025-01-01"))).toBe("2025-01-01");
  });
});

describe("DECIMAL mapping", () => {
  it("converts a Decimal-like object without losing the value", () => {
    // Stands in for Prisma's Decimal: what matters is that it stringifies.
    expect(toNumber({ toString: () => "30.00" })).toBe(30);
    expect(toNumber({ toString: () => "0.50" })).toBe(0.5);
  });

  it("passes numbers through", () => {
    expect(toNumber(8)).toBe(8);
  });
});
