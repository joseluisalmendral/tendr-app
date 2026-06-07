import "server-only";

import { createClient } from "@supabase/supabase-js";

/**
 * Service-role signed-URL helper for the F6 worker.
 *
 * The Inngest extractor runs with NO user session, so it cannot use the
 * RLS-bound user Storage client. It signs the private `documents` object with
 * the service_role key instead (server-only — the key never reaches the
 * client bundle). The returned value is a short-lived signed download URL
 * STRING; the PDF bytes are fetched inside the extract step, never returned
 * from a step.
 *
 * Env: `SUPABASE_URL` (or `NEXT_PUBLIC_SUPABASE_URL`) + `SUPABASE_SERVICE_ROLE_KEY`
 * (or `SUPABASE_SECRET_KEY`). These are the same admin credentials the worker
 * already relies on; plaintext provider keys are NOT involved here.
 */
function serviceSupabase() {
  const url =
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SECRET_KEY ??
    "";
  if (!url || !key) {
    throw new Error("Supabase service credentials are not set.");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Returns a signed download URL string for `path` in `bucket`, valid for `ttlSeconds`. */
export async function createSignedDownloadUrl(
  bucket: string,
  path: string,
  ttlSeconds: number,
): Promise<string> {
  const { data, error } = await serviceSupabase()
    .storage.from(bucket)
    .createSignedUrl(path, ttlSeconds);

  if (error || !data?.signedUrl) {
    throw new Error(error?.message ?? "Could not sign URL.");
  }
  return data.signedUrl;
}
