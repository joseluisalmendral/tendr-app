"use server";

import { revalidatePath } from "next/cache";

import { ensureAnonymousWorkspace } from "@/app/(auth)/actions";
import {
  saveProviderKeyWith,
  type SaveProviderKeyInput,
  type SaveProviderKeyResult,
} from "@/app/(app)/settings/ai/save-provider-key";
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
  input: SaveProviderKeyInput,
): Promise<SaveProviderKeyResult> {
  const resolved = await resolveWorkspaceActor();
  if (!resolved) {
    return { ok: false, error: "Key inválida" };
  }

  const result = await saveProviderKeyWith(
    { serviceDb, validateProviderKey, encryptProviderKey },
    resolved.workspaceId,
    input,
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
