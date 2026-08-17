import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Pinned to tests/ so that build output or the generated Prisma client can
    // never be collected as a test suite.
    include: ["tests/**/*.test.ts"],
    // The modules read config at import time, so the suite pins it here rather
    // than depending on whatever .env the machine happens to have. The URL is
    // never dialled: tests replace the Prisma client.
    env: {
      DATABASE_URL: "mysql://test:test@127.0.0.1:3307/habit_tracker_test",
      APP_TIMEZONE: "Asia/Singapore",
      NODE_ENV: "test",
    },
  },
});
