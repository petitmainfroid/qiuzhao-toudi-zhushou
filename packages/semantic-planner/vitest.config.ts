import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "packages/semantic-planner/tests/**/*.test.ts",
      "packages/policy-compiler/tests/**/*.test.ts"
    ]
  }
});
