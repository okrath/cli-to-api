import { afterEach, describe, expect, it } from "vitest";

describe("detectAdapters", () => {
  afterEach(async () => {
    const { refreshAdapterDetection } = await import("../../src/adapters/index.js");
    refreshAdapterDetection();
  });

  it.skipIf(process.platform !== "win32")(
    "reports a claude-code version when the CLI is installed",
    async () => {
      const { detectAdapters, refreshAdapterDetection } = await import("../../src/adapters/index.js");
      refreshAdapterDetection();
      const rows = await detectAdapters();
      const claude = rows.find((row) => row.id === "claude-code");
      if (!claude?.installed) return;
      expect(claude.version).toBeTruthy();
    },
  );
});
