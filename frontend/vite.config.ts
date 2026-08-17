import react from "@vitejs/plugin-react";
// vitest's re-export of defineConfig is what types the `test` block below.
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Same-origin API calls in development, so there is no CORS configuration
    // to get wrong and no API base URL baked into the bundle.
    proxy: {
      "/api": { target: "http://localhost:3001", changeOrigin: true },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.ts",
  },
});
