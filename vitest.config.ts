import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "drizzle-orm": path.resolve(__dirname, "apps/gateway/node_modules/drizzle-orm"),
      "yaml": path.resolve(__dirname, "apps/gateway/node_modules/yaml"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts", "apps/**/*.test.ts"],
    testTimeout: 30000,
    env: {
      DATA_DIR: "./data/test-data",
    },
  },
});
