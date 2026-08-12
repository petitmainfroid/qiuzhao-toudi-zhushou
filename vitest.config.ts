import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}", "evals/real-pages/**/*.test.ts"],
    pool: "forks",
    poolOptions: {
      forks: { singleFork: true }
    }
  }
});
