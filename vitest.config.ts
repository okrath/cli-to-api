import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["apps/**/tests/**/*.test.ts", "tests/**/*.test.ts"],
    fileParallelism: false,
  },
});
