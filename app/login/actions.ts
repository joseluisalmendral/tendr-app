"use server";

import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

/**
 * State returned to the login form's useActionState hook.
 *
 * `sent` is intentionally identical whether or not the email already exists:
 * the form must never reveal account existence (no user enumeration).
 */
export type SendMagicLinkState =
  | { status: "idle" }
  | { status: "sent" }
  | { status: "error"; message: string };

const emailSchema = z.object({
  email: z.string().trim().email(),
});

// Generic, non-enumerating error. The same message is shown for provider rate
// limits, malformed addresses at the provider, and network failures so the
// response never depends on whether the email is registered.
const GENERIC_ERROR =
  "No pudimos enviar el enlace. Revisá la dirección e intentá de nuevo.";

// Surfaced ONLY when the email already belongs to another permanent account.
// MVP has no account merge, so the user must use a different address. This is
// a usability message for a dead-end, not an enumeration oracle for arbitrary
// addresses (it can only ever fire for an anonymous user's own attach attempt).
const EMAIL_TAKEN_ERROR =
  "Ese correo ya está en uso. Probá con otra dirección.";

function redirectTo(): string {
  return `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`;
}

/**
 * Sends an email sign-in / promotion link.
 *
 * Bifurcates on the CURRENT session state read from getClaims():
 *   - Anonymous session: attach the email to the SAME user via
 *     updateUser({ email }). Once confirmed, auth.uid() is preserved and every
 *     workspace_id-scoped row stays attached with zero data migration.
 *   - No session / non-anonymous: signInWithOtp({ shouldCreateUser: true })
 *     issues a fresh sign-in; a brand-new user gets a NEW auth.uid().
 *
 * Never logs tokens, JWTs, or link URLs.
 */
export async function sendMagicLink(
  _prevState: SendMagicLinkState,
  formData: FormData,
): Promise<SendMagicLinkState> {
  const parsed = emailSchema.safeParse({ email: formData.get("email") });
  // Invalid input is rejected BEFORE any Supabase call.
  if (!parsed.success) {
    return {
      status: "error",
      message: "Ingresá un correo electrónico válido.",
    };
  }

  const email = parsed.data.email;
  const supabase = await createClient();

  const emailRedirectTo = redirectTo();

  const { data: claimsData } = await supabase.auth.getClaims();
  const isAnonymous = claimsData?.claims?.is_anonymous === true;

  if (isAnonymous) {
    // Attach email to the current anonymous user → uid-preserving promotion.
    const { error } = await supabase.auth.updateUser(
      { email },
      { emailRedirectTo },
    );
    if (error) {
      // email_exists (422): the address belongs to another account. No merge
      // in MVP, so guide the user to a different address.
      if (error.code === "email_exists" || error.status === 422) {
        return { status: "error", message: EMAIL_TAKEN_ERROR };
      }
      return { status: "error", message: GENERIC_ERROR };
    }
    return { status: "sent" };
  }

  // No session or already-permanent unauthenticated visitor: fresh email
  // sign-in. shouldCreateUser keeps the response identical for new and
  // existing emails (no enumeration).
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo, shouldCreateUser: true },
  });
  if (error) {
    return { status: "error", message: GENERIC_ERROR };
  }
  return { status: "sent" };
}
