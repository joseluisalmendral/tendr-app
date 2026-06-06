import "server-only";

import {
  getCurrentWorkspace,
  type CurrentWorkspace,
} from "@/lib/auth/get-current-workspace";

/**
 * Testable session guard for the (app) route group.
 *
 * Returns the resolved workspace when a session exists, or null when there is
 * no authenticated user. The (app) layout redirects to /login on null; this
 * helper isolates the decision so it can be unit-tested without rendering the
 * RSC (no jsdom needed) — the test asserts a provisioned tenant resolves a
 * user + workspaceName, and an anonymous client with no session resolves null.
 */
export async function requireSession(): Promise<CurrentWorkspace | null> {
  return getCurrentWorkspace();
}
