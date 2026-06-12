import { NextResponse } from "next/server";

/**
 * Synthetic error route used to verify Sentry is capturing server errors.
 *
 * Disabled in production: returns 404 when NODE_ENV === 'production' so it can
 * never be triggered against the live deployment. In any other environment it
 * throws, which Sentry captures via `onRequestError` (see instrumentation.ts).
 *
 * NOTE: this lives at `/api/sentry-test` (NOT `_sentry-test`). The App Router
 * treats a leading-underscore segment as a PRIVATE folder and excludes it from
 * routing, so an underscore path would be unreachable. The production guard
 * below is what disables it in prod.
 */
export const dynamic = "force-dynamic";

export function GET() {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse("Not Found", { status: 404 });
  }

  throw new Error("Sentry synthetic test error (GET /api/sentry-test)");
}
