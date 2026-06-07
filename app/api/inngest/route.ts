import { serve } from "inngest/next";

import { inngest } from "@/inngest/client";
import { extractDocument } from "@/inngest/extract-document";

/**
 * Inngest HTTP endpoint (App Router).
 *
 * `serve` exposes GET (introspection), POST (function invocation), and PUT
 * (registration sync) for the Inngest dev server / cloud. Request signing is
 * driven by `INNGEST_SIGNING_KEY`: in local dev the dev server is relaxed and
 * the key is optional; in production Inngest enforces signature verification.
 * The key is read from the environment by the SDK — never hardcoded here.
 */
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [extractDocument],
});
