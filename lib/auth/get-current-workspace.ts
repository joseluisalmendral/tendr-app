import "server-only";

import { cache } from "react";

import {
  resolveCurrentWorkspace,
  type CurrentWorkspace,
} from "@/lib/auth/resolve-current-workspace";
import { createClient } from "@/lib/supabase/server";

export type { CurrentWorkspace };

/**
 * Single entry point for "who am I and which workspace am I in".
 *
 * Wrapped in React.cache() so multiple Server Components calling it within
 * the same render pass share one auth check and one workspace lookup. The
 * cookie-bound server client is injected into the pure
 * `resolveCurrentWorkspace` decision logic (import-tested separately).
 *
 * Returns null when there is no session — protected routes should never
 * reach that state because the proxy creates an anonymous session first.
 */
export const getCurrentWorkspace = cache(
  async (): Promise<CurrentWorkspace | null> => {
    const supabase = await createClient();
    return resolveCurrentWorkspace(supabase);
  },
);
