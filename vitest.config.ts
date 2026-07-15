import { defineConfig } from "vitest/config";
export default defineConfig({
  resolve: {
    alias: {
      "@laboratory/shared-types": new URL(
        "./packages/shared-types/src/index.ts",
        import.meta.url,
      ).pathname,
      "@laboratory/workspace-security": new URL(
        "./packages/workspace-security/src/index.ts",
        import.meta.url,
      ).pathname,
      "@laboratory/local-model-client": new URL(
        "./packages/local-model-client/src/index.ts",
        import.meta.url,
      ).pathname,
      "@laboratory/tracing": new URL(
        "./packages/tracing/src/index.ts",
        import.meta.url,
      ).pathname,
      "@laboratory/filesystem-tools": new URL(
        "./packages/filesystem-tools/src/index.ts",
        import.meta.url,
      ).pathname,
      "@laboratory/process-tools": new URL(
        "./packages/process-tools/src/index.ts",
        import.meta.url,
      ).pathname,
      "@laboratory/agent-runtime": new URL(
        "./packages/agent-runtime/src/index.ts",
        import.meta.url,
      ).pathname,
    },
  },
  test: {
    include: [
      "packages/*/test/**/*.test.ts",
      "apps/*/test/**/*.test.ts",
      "scripts/test/**/*.test.ts",
    ],
    testTimeout: 15000,
  },
});
