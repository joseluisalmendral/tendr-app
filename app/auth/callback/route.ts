import { type EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

// EmailOtpType values our flow can emit: "email"/"magiclink" for sign-in,
// "email_change" for anonymous → permanent promotion. Anything else is treated
// as an invalid link.
const ALLOWED_TYPES = new Set<EmailOtpType>([
  "email",
  "magiclink",
  "signup",
  "email_change",
]);

function isEmailOtpType(value: string | null): value is EmailOtpType {
  return value !== null && ALLOWED_TYPES.has(value as EmailOtpType);
}

// 303 forces the follow-up request to be a GET regardless of how the browser
// arrived here. Always redirect through here — no `next` param is honored, so
// the destination can never be influenced by the link (open-redirect safe).
function redirect(request: NextRequest, path: string): NextResponse {
  return NextResponse.redirect(new URL(path, request.url), { status: 303 });
}

/**
 * Email link verification + promotion detection.
 *
 * Contract path: ?token_hash=…&type=email|email_change|magiclink. We verify
 * with verifyOtp({ type, token_hash }) because the SSR clients hardcode the
 * PKCE flow, and a server-initiated flow never stored the browser
 * code_verifier exchangeCodeForSession would need.
 *
 * Promotion is detected from the verifyOtp-returned user (anonymous-before,
 * non-anonymous-after) — NEVER from stale pre-verification claims. On a true
 * promotion we append one audit row via the log_promotion() RPC.
 *
 * Never logs token_hash, the link, JWTs, or any secret.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");

  // Defensive tolerance: a PKCE `code` link is NOT our contract path. We do not
  // attempt exchangeCodeForSession (no server-side code_verifier exists), so a
  // code-only link is an invalid link for this flow.
  if (!tokenHash || !isEmailOtpType(type)) {
    return redirect(request, "/login?error=invalid_link");
  }

  const supabase = await createClient();

  // Capture the pre-verification anonymous flag so we can recognise a genuine
  // anonymous → permanent transition. We do NOT rely on this for the post-state
  // (it is stale after verification); the verifyOtp response is the source of
  // truth for the new identity.
  const { data: beforeClaims } = await supabase.auth.getClaims();
  const wasAnonymous = beforeClaims?.claims?.is_anonymous === true;

  const { data, error } = await supabase.auth.verifyOtp({
    type,
    token_hash: tokenHash,
  });
  if (error || !data.user) {
    return redirect(request, "/login?error=verification_failed");
  }

  // Promotion = anonymous before, non-anonymous after. data.user is fresh from
  // verifyOtp, so is_anonymous is authoritative here.
  const promoted = wasAnonymous && data.user.is_anonymous === false;
  if (promoted) {
    // The audit trace is best-effort: the user IS promoted at this point
    // (verifyOtp succeeded), so a failed audit insert must not strand them.
    // Swallow the error — never surface the cause, never log token material.
    await supabase.rpc("log_promotion");
  }

  return redirect(request, "/app");
}
