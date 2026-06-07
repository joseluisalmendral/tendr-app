import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

/**
 * Vitest config for the RLS + workspace-core suites.
 *
 * Tests run against the LOCAL Supabase stack (`supabase start`). The setup
 * file resolves local credentials at runtime and provisions two isolated
 * tenants. These tests share the local stack and are stateful, so the suite
 * runs single-threaded with a generous hook timeout for auth provisioning.
 *
 * The `@/` alias mirrors tsconfig `paths` so app/lib modules (e.g. the
 * dashboard count queries) can be imported directly in tests.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
      // `server-only` throws when imported outside an RSC build. The F6 worker
      // and its service_role db module are legitimately server-only but must be
      // importable under vitest (Node), so stub the guard to a no-op here.
      "server-only": fileURLToPath(
        new URL("./test/stubs/server-only.ts", import.meta.url),
      ),
    },
  },
  test: {
    include: [
      "db/__tests__/**/*.test.ts",
      "app/**/__tests__/**/*.test.ts",
      "lib/**/__tests__/**/*.test.ts",
      "inngest/**/__tests__/**/*.test.ts",
    ],
    environment: "node",
    // RLS tests share the local stack and mutate tenant state — keep them
    // strictly sequential, one fork at a time.
    fileParallelism: false,
    pool: "forks",
    hookTimeout: 30000,
    testTimeout: 30000,
  },
});
