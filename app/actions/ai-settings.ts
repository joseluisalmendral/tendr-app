"use server";

import { revalidatePath } from "next/cache";

import { ensureAnonymousWorkspace } from "@/app/(auth)/actions";
import {
  saveProviderKeyWith,
  saveProviderKeySchema,
  type SaveProviderKeyResult,
} from "@/app/(app)/settings/ai/save-provider-key";
import {
  deleteProviderKeyWith,
  deleteProviderKeySchema,
  type DeleteProviderKeyInput,
  type DeleteProviderKeyResult,
} from "@/app/(app)/settings/ai/delete-provider-key";
import {
  setFeatureModelWith,
  type SetFeatureModelInput,
  type SetFeatureModelResult,
} from "@/app/(app)/settings/ai/set-feature-model";
import { db } from "@/db";
import { serviceDb } from "@/db/service";
import { getCurrentWorkspace } from "@/lib/auth/get-current-workspace";
import { encryptProviderKey } from "@/lib/crypto/envelope";
import { validateProviderKey } from "@/lib/ai/validate-provider-key";

export type { SaveProviderKeyResult } from "@/app/(app)/settings/ai/save-provider-key";
export type { SetFeatureModelResult } from "@/app/(app)/settings/ai/set-feature-model";
export type { DeleteProviderKeyResult } from "@/app/(app)/settings/ai/delete-provider-key";

/**
 * Thin `"use server"` wrappers for the /settings/ai key + feature-model actions.
 *
 * Each resolves the caller's session + workspace and injects the real deps into
 * the pure seam (the seam holds all logic and is import-tested against the live
 * local stack). EXACTLY the deleteDocument/uploadDocument wrapper precedent.
 *
 * SECRETS HARD-STOP: the plaintext key only crosses this boundary once (from the
 * client form to `saveProviderKeyWith`); it is encrypted + discarded inside the
 * seam and NEVER returned, logged, or revalidated back to the client.
 *
 * DEV-LOGGER HARDENING: `saveProviderKey` takes the key as a `FormData` field
 * (NOT a typed object argument). Next.js 16's `next dev` Server Action logger
 * prints positional action arguments to stdout; a plain `{ key }` argument would
 * echo the plaintext once (dev only, never in `next build`/`next start`). A
 * `FormData` instance logs as an opaque object, so the literal key never reaches
 * that logger. The pure seam (`saveProviderKeyWith`) keeps its typed signature —
 * only this `"use server"` wrapper boundary changed.
 */

/**
 * Resolves the caller's workspace + actor id, provisioning an anonymous
 * workspace if a fresh visitor has none yet. Returns null when there is no
 * usable session (the (app) layout guard makes that unreachable in practice).
 */
async function resolveWorkspaceActor(): Promise<{
  workspaceId: string;
  actorId: string;
} | null> {
  let current = await getCurrentWorkspace();

  if (current && current.workspaceId === null) {
    await ensureAnonymousWorkspace();
    current = await getCurrentWorkspace();
  }

  if (!current?.workspaceId) return null;
  return { workspaceId: current.workspaceId, actorId: current.user.id };
}

export async function saveProviderKey(
  formData: FormData,
): Promise<SaveProviderKeyResult> {
  const resolved = await resolveWorkspaceActor();
  if (!resolved) {
    return { ok: false, error: "Key inválida" };
  }

  // Validate the FormData shape here (same provider enum + key length bounds as
  // the seam). The seam re-validates defensively, so this is belt-and-braces;
  // either rejection returns the detail-free message.
  const parsed = saveProviderKeySchema.safeParse({
    provider: formData.get("provider"),
    key: formData.get("key"),
  });
  if (!parsed.success) {
    return { ok: false, error: "Key inválida" };
  }

  const result = await saveProviderKeyWith(
    { serviceDb, validateProviderKey, encryptProviderKey },
    resolved.workspaceId,
    parsed.data,
    resolved.actorId,
  );

  if (result.ok) {
    revalidatePath("/settings/ai");
  }

  return result;
}

/**
 * Revokes (deletes) the configured BYO key for a provider. NO secret crosses
 * this boundary — only the provider id travels (a plain string argument is
 * safe to log; it carries no key bytes). After a successful revoke the provider
 * card returns to "No configurado"; feature mappings still pointing at that
 * provider will fail with NO_KEY_CONFIGURED at use time, by design (taxonomy).
 */
export async function deleteProviderKey(
  input: DeleteProviderKeyInput,
): Promise<DeleteProviderKeyResult> {
  const resolved = await resolveWorkspaceActor();
  if (!resolved) {
    return { ok: false, error: "Tu sesión expiró. Vuelve a iniciar sesión." };
  }

  // Belt-and-braces shape check (the seam re-validates defensively).
  const parsed = deleteProviderKeySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "No hay key configurada para ese provider." };
  }

  const result = await deleteProviderKeyWith(
    { serviceDb },
    resolved.workspaceId,
    parsed.data,
    resolved.actorId,
  );

  if (result.ok) {
    revalidatePath("/settings/ai");
  }

  return result;
}

export async function setFeatureModel(
  input: SetFeatureModelInput,
): Promise<SetFeatureModelResult> {
  const resolved = await resolveWorkspaceActor();
  if (!resolved) {
    return { ok: false, error: "Tu sesión expiró. Vuelve a iniciar sesión." };
  }

  const result = await setFeatureModelWith(
    { db, serviceDb },
    resolved.workspaceId,
    input,
    resolved.actorId,
  );

  if (result.ok) {
    revalidatePath("/settings/ai");
  }

  return result;
}
