"use server";

import { ensureAnonymousWorkspace } from "@/app/(auth)/actions";
import { db } from "@/db";
import { getProviderClient } from "@/lib/ai/get-provider-client";
import { manifestCostFor } from "@/lib/ai/manifest-cost";
import { createLangfuseTracePort } from "@/lib/ai/trace";
import { getCurrentWorkspace } from "@/lib/auth/get-current-workspace";

import {
  summarizeWith,
  type SummarizeInput,
  type SummarizeResult,
} from "./summarize";
import {
  suggestWith,
  type SuggestInput,
  type SuggestResult,
} from "./suggest";
import {
  beautifyEmailWith,
  type BeautifyEmailInput,
  type BeautifyEmailResult,
} from "./beautify-email";

export type { SummarizeResult } from "./summarize";
export type { SuggestResult } from "./suggest";
export type { BeautifyEmailResult } from "./beautify-email";

/**
 * Thin `"use server"` wrappers for the non-streaming AI features `summarize`
 * and `suggest` (F7 Block C / PR4a). Each resolves the caller's workspace and
 * injects the real deps into the pure seam (the seam holds all logic and is
 * import-tested against the live local stack). The streaming `adaptTemplate`
 * feature is a Route Handler (app/api/ai/adapt-template/route.ts), not a Server
 * Action, because progressive byte streaming is a Route Handler concern.
 *
 * SECRETS HARD-STOP: the seams trace metadata/lengths only; note, summary, and
 * suggestion text never reach a Langfuse span, the logs, or this boundary's
 * return value beyond the user-facing result fields.
 */

async function resolveWorkspaceId(): Promise<string | null> {
  let current = await getCurrentWorkspace();
  if (current && current.workspaceId === null) {
    await ensureAnonymousWorkspace();
    current = await getCurrentWorkspace();
  }
  return current?.workspaceId ?? null;
}

export async function summarize(
  input: SummarizeInput,
): Promise<SummarizeResult> {
  const workspaceId = await resolveWorkspaceId();
  if (!workspaceId) {
    return {
      ok: false,
      errorCode: "validation_error",
      error: "Tu sesión expiró. Vuelve a iniciar sesión.",
    };
  }

  const trace = await createLangfuseTracePort();
  return summarizeWith(
    { db, getProviderClient, getManifestCost: manifestCostFor, trace },
    workspaceId,
    input,
  );
}

export async function suggest(input: SuggestInput): Promise<SuggestResult> {
  const workspaceId = await resolveWorkspaceId();
  if (!workspaceId) {
    return {
      ok: false,
      errorCode: "validation_error",
      error: "Tu sesión expiró. Vuelve a iniciar sesión.",
    };
  }

  const trace = await createLangfuseTracePort();
  return suggestWith(
    { db, getProviderClient, getManifestCost: manifestCostFor, trace },
    workspaceId,
    input,
  );
}

export async function beautifyEmail(
  input: BeautifyEmailInput,
): Promise<BeautifyEmailResult> {
  const workspaceId = await resolveWorkspaceId();
  if (!workspaceId) {
    return {
      ok: false,
      errorCode: "validation_error",
      error: "Tu sesión expiró. Vuelve a iniciar sesión.",
    };
  }

  const trace = await createLangfuseTracePort();
  return beautifyEmailWith(
    { db, getProviderClient, getManifestCost: manifestCostFor, trace },
    workspaceId,
    input,
  );
}
