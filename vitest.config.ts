import { defineConfig } from "vitest/config";

/**
 * Vitest config for the F3 RLS suite.
 *
 * Tests run against the LOCAL Supabase stack (`supabase start`). The setup
 * file resolves local credentials at runtime and provisions two isolated
 * tenants. RLS tests are inherently sequential and stateful, so the suite runs
 * single-threaded with a generous hook timeout for auth provisioning.
 */
export default defineConfig({
  test: {
    include: ["db/__tests__/**/*.test.ts"],
    environment: "node",
    // RLS tests share the local stack and mutate tenant state — keep them
    // strictly sequential, one fork at a time.
    fileParallelism: false,
    pool: "forks",
    hookTimeout: 30000,
    testTimeout: 30000,
  },
});
