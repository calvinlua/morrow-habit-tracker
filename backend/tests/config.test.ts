import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

const minimal = { DATABASE_URL: "mysql://user:pass@127.0.0.1:3307/habit_tracker" };

describe("loadConfig", () => {
  it("fills in the defaults when only the connection string is set", () => {
    expect(loadConfig({ ...minimal })).toEqual({
      PORT: 3001,
      DATABASE_URL: minimal.DATABASE_URL,
      APP_TIMEZONE: "Asia/Singapore",
      NODE_ENV: "development",
    });
  });

  it("reads the values it is given", () => {
    const config = loadConfig({
      ...minimal,
      PORT: "4000",
      APP_TIMEZONE: "Europe/Berlin",
      NODE_ENV: "production",
    });
    expect(config).toMatchObject({
      PORT: 4000,
      APP_TIMEZONE: "Europe/Berlin",
      NODE_ENV: "production",
    });
  });

  it("refuses to start without a connection string", () => {
    // The alternative is connecting to whatever happens to be on localhost.
    expect(() => loadConfig({})).toThrow(/DATABASE_URL is required/);
  });

  it.each([
    ["not-a-number", "PORT"],
    ["0", "PORT"],
    ["99999", "PORT"],
  ])("rejects PORT=%s", (port, field) => {
    expect(() => loadConfig({ ...minimal, PORT: port })).toThrow(new RegExp(field));
  });

  it("rejects a timezone Intl does not recognise", () => {
    expect(() => loadConfig({ ...minimal, APP_TIMEZONE: "Mars/Olympus" })).toThrow(
      /not an IANA timezone/,
    );
  });

  it("rejects an unknown NODE_ENV", () => {
    expect(() => loadConfig({ ...minimal, NODE_ENV: "staging" })).toThrow(/NODE_ENV/);
  });

  it("reports every problem at once rather than one per restart", () => {
    const message = getError(() => loadConfig({ PORT: "abc", APP_TIMEZONE: "Nowhere/Here" }));

    expect(message).toMatch(/DATABASE_URL/);
    expect(message).toMatch(/PORT/);
    expect(message).toMatch(/APP_TIMEZONE/);
  });

  it("treats a blank timezone as absent rather than invalid", () => {
    expect(loadConfig({ ...minimal, APP_TIMEZONE: "  " }).APP_TIMEZONE).toBe("Asia/Singapore");
  });
});

function getError(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error("Expected loadConfig to throw.");
}
