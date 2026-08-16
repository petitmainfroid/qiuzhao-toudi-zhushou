import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "modules/semantic-planner/tests/**/*.test.ts",
      "modules/policy-compiler/tests/**/*.test.ts"
    ]
  }
});
