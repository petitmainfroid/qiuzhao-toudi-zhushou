import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: [
      "shared/**/*.test.{ts,tsx}",
      "modules/**/*.test.{ts,tsx}",
      "gerenxinxi/**/*.test.{ts,tsx}"
    ],
    exclude: ["**/node_modules/**", "**/dist-ui/**"],
    pool: "forks",
    poolOptions: {
      forks: { singleFork: true }
    }
  }
});
