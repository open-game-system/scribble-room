import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["e2e/**/*.seam.test.ts"],
    testTimeout: 120_000,
    hookTimeout: 60_000,
    fileParallelism: false,
    // The OGS key set the dev server checks game tokens against (e2e/ogs-jwks.ts).
    globalSetup: ["e2e/ogs-jwks.global-setup.ts"],
  },
});
