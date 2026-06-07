import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * sendMagicLink Server Action — anonymous-promotion audit-write behaviour
 * (regression guard for the auto-confirm audit gap).
 *
 * Bug: with Supabase "Confirm email" DISABLED, updateUser({ email }) applies the
 * email IMMEDIATELY — no link is sent, the returned user is already
 * is_anonymous=false, and /auth/callback NEVER runs. The callback was the SINGLE
 * writer of the promote_user audit row (via the log_promotion RPC), so in that
 * mode the row was never written (verified live: promotion with zero audit
 * trace). The fix fires log_promotion from the action when auto-confirm applied
 * the change in-place, while staying silent in the confirmations-enabled world
 * (returned user still anonymous → callback remains the sole writer, no
 * double-logging).
 *
 * Pure logic test, no DOM / no live stack: we mock @/lib/supabase/server so
 * createClient() returns a fake client whose auth + rpc surface we drive
 * per-case and assert the RPC call exactly.
 */

const getClaimsMock = vi.fn();
const updateUserMock = vi.fn();
const signInWithOtpMock = vi.fn();
const rpcMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getClaims: getClaimsMock,
      updateUser: updateUserMock,
      signInWithOtp: signInWithOtpMock,
    },
    rpc: rpcMock,
  }),
}));

// redirectTo() reads this; the value is irrelevant to the assertions but must be
// defined so the action does not build an `undefined/auth/callback` string.
process.env.NEXT_PUBLIC_SITE_URL ??= "http://localhost:3000";

// Imported AFTER the mock is registered so the action binds to the fake client.
const { sendMagicLink } = await import("../actions");

function formDataWith(email: string): FormData {
  const fd = new FormData();
  fd.set("email", email);
  return fd;
}

const idle = { status: "idle" } as const;

describe("sendMagicLink — anonymous promotion audit write", () => {
  beforeEach(() => {
    signInWithOtpMock.mockResolvedValue({ error: null });
    rpcMock.mockResolvedValue({ data: null, error: null });
  });

  afterEach(() => {
    getClaimsMock.mockReset();
    updateUserMock.mockReset();
    signInWithOtpMock.mockReset();
    rpcMock.mockReset();
  });

  it("auto-confirm applied (user no longer anonymous) → log_promotion called exactly once", async () => {
    // Confirm-email DISABLED world: updateUser returns the already-promoted user.
    getClaimsMock.mockResolvedValue({
      data: { claims: { is_anonymous: true } },
    });
    updateUserMock.mockResolvedValue({
      data: { user: { is_anonymous: false } },
      error: null,
    });

    const result = await sendMagicLink(idle, formDataWith("owner@example.com"));

    expect(result.status).toBe("promoted");
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledWith("log_promotion");
  });

  it("confirmations enabled (returned user still anonymous) → RPC NOT called, status sent", async () => {
    // Confirm-email ENABLED world: the email change is pending the link, so the
    // returned user is still anonymous and the callback stays the sole writer.
    getClaimsMock.mockResolvedValue({
      data: { claims: { is_anonymous: true } },
    });
    updateUserMock.mockResolvedValue({
      data: { user: { is_anonymous: true } },
      error: null,
    });

    const result = await sendMagicLink(idle, formDataWith("pending@example.com"));

    expect(result.status).toBe("sent");
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("updateUser fails with email_exists → error state, RPC NOT called", async () => {
    getClaimsMock.mockResolvedValue({
      data: { claims: { is_anonymous: true } },
    });
    updateUserMock.mockResolvedValue({
      data: { user: null },
      error: { code: "email_exists", status: 422 },
    });

    const result = await sendMagicLink(idle, formDataWith("taken@example.com"));

    expect(result.status).toBe("error");
    expect(rpcMock).not.toHaveBeenCalled();
    // The promotion path was the one attempted (not the OTP fallback).
    expect(signInWithOtpMock).not.toHaveBeenCalled();
  });

  it("non-anonymous session → signInWithOtp path, RPC NOT called", async () => {
    getClaimsMock.mockResolvedValue({
      data: { claims: { is_anonymous: false } },
    });

    const result = await sendMagicLink(idle, formDataWith("fresh@example.com"));

    expect(result.status).toBe("sent");
    expect(updateUserMock).not.toHaveBeenCalled();
    expect(rpcMock).not.toHaveBeenCalled();
    expect(signInWithOtpMock).toHaveBeenCalledTimes(1);
  });
});
