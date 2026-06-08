import { NextResponse } from "next/server";

import { db } from "@/db";
import { getProviderClient } from "@/lib/ai/get-provider-client";
import { manifestCostFor } from "@/lib/ai/manifest-cost";
import { statusForCode, type AiErrorCode } from "@/lib/ai/provider-errors";
import { createLangfuseTracePort } from "@/lib/ai/trace";
import { getCurrentWorkspace } from "@/lib/auth/get-current-workspace";
import { PlanGateError, requirePlanWith } from "@/lib/auth/require-plan";

import {
  adaptTemplateStreamWith,
  type AdaptTemplateInput,
} from "./adapt-template-stream";

/**
 * POST /api/ai/adapt-template — streaming endpoint for the adaptTemplate feature
 * (F7 Block C / PR4a).
 *
 * Streaming is a first-class Route Handler concern in the App Router (Server
 * Actions return serialized values, not progressive byte streams), so the
 * thin wrapper here resolves the workspace, injects the real deps into the pure
 * `adaptTemplateStreamWith` seam, and returns `result.toTextStreamResponse()`.
 * The /templates "Adaptar" dialog consumes the byte stream with a native Fetch
 * `Response.body` reader.
 *
 * Error contract (design §4): 400 validation_error / 404 not_found / 401
 * INVALID_KEY / 429 RATE_LIMIT|budget_exceeded / 402 INSUFFICIENT_CREDITS / 404
 * MODEL_NOT_AVAILABLE — JSON body { error, code }. No stream starts on error.
 */

export const dynamic = "force-dynamic";

function errorResponse(
  code: AdaptErrorCode,
  message: string,
): NextResponse {
  const status =
    code === "validation_error"
      ? 400
      : code === "not_found"
        ? 404
        : code === "budget_exceeded"
          ? 429
          : statusForCode(code as AiErrorCode);
  return NextResponse.json({ error: message, code }, { status });
}

type AdaptErrorCode =
  | AiErrorCode
  | "validation_error"
  | "not_found"
  | "budget_exceeded";

export async function POST(request: Request): Promise<Response> {
  const ws = await getCurrentWorkspace();
  if (!ws?.workspaceId) {
    return NextResponse.json(
      { error: "Tu sesión expiró. Vuelve a iniciar sesión.", code: "unauthorized" },
      { status: 401 },
    );
  }

  // F8 plan gate (PAID feature). Uses the same RLS `db` the seam is injected
  // with (the authenticated user can SELECT only their own subscription row).
  // A genuine entitlement denial returns 403 with a redirect hint; ANY other
  // error (a DB/infra failure) rethrows and falls through to the route's
  // generic error handling (a 500), never a 403.
  try {
    await requirePlanWith(db, ws.workspaceId, "pro");
  } catch (e) {
    if (e instanceof PlanGateError) {
      return NextResponse.json(
        { error: "upgrade required", code: "plan_required", redirectTo: "/upgrade" },
        { status: 403 },
      );
    }
    throw e;
  }

  let body: AdaptTemplateInput;
  try {
    body = (await request.json()) as AdaptTemplateInput;
  } catch {
    return errorResponse("validation_error", "Cuerpo de la petición inválido.");
  }

  const trace = await createLangfuseTracePort();

  const result = await adaptTemplateStreamWith(
    { db, getProviderClient, getManifestCost: manifestCostFor, trace },
    ws.workspaceId,
    body,
  );

  if (!result.ok) {
    return errorResponse(result.errorCode, result.error);
  }

  return result.stream.toTextStreamResponse();
}
