import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  {
    test: {
      name: "repo",
      include: ["packages/*/src/**/*.test.ts", "apps/*/src/**/*.test.ts"],
      exclude: ["**/dist/**", "**/node_modules/**"],
    },
  },
]);
