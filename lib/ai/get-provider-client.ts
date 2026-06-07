import "server-only";

import { createAnthropic } from "@ai-sdk/anthropic";
import { createDeepSeek } from "@ai-sdk/deepseek";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";
import { and, eq } from "drizzle-orm";

import { aiProviderConfigs } from "@/db/schema/ai";
import type { aiProvider } from "@/db/schema/enums";
import { serviceDb } from "@/db/service";
import { decryptProviderKey } from "@/lib/crypto/envelope";

/**
 * Provider client factory for AI features (F7).
 *
 * F7 widens the F6-frozen signature: `getProviderClient` is now ASYNC because
 * it reads the per-workspace envelope from `ai_provider_configs` (serviceDb,
 * RLS-bypassed because the encrypted_* columns are REVOKEd from user roles),
 * decrypts the BYO key in memory, builds the matching Vercel AI SDK provider
 * client for any of the 5 providers, and stamps `last_used_at`.
 *
 * SECRETS HARD-STOP: the decrypted plaintext key lives ONLY inside the returned
 * provider-client closure. It is never assigned to module scope, logged,
 * traced, or returned to the caller.
 */

export type AiProvider = (typeof aiProvider.enumValues)[number];

/**
 * The narrow shape every AI SDK provider factory shares: call it with a model
 * id to get a `LanguageModel` usable by streamText/generateText/generateObject.
 */
export type ProviderClient = (modelId: string) => LanguageModel;

/**
 * Moonshot/Kimi is wired through the OpenAI-compatible endpoint per ADR-003
 * (Context7-verified 2026-06-06). No dedicated SDK package is installed.
 */
const MOONSHOT_BASE_URL = "https://api.moonshot.ai/v1";

/**
 * Thrown when a workspace requests a provider it has no configured key for.
 */
export class ProviderNotConfiguredError extends Error {
  constructor(provider: string) {
    super(`No key configured for ${provider}`);
    this.name = "ProviderNotConfiguredError";
  }
}

/**
 * Builds the AI SDK provider client for `provider`, closing over `apiKey`.
 *
 * Injectable via `__setProviderFactory` so tests can substitute a mock model
 * WITHOUT a real SDK key call or network access. The plaintext key is consumed
 * here and never escapes this closure.
 */
type ProviderFactory = (provider: AiProvider, apiKey: string) => ProviderClient;

const defaultProviderFactory: ProviderFactory = (provider, apiKey) => {
  switch (provider) {
    case "openai": {
      const client = createOpenAI({ apiKey });
      return (modelId) => client(modelId);
    }
    case "anthropic": {
      const client = createAnthropic({ apiKey });
      return (modelId) => client(modelId);
    }
    case "google": {
      const client = createGoogleGenerativeAI({ apiKey });
      return (modelId) => client(modelId);
    }
    case "deepseek": {
      const client = createDeepSeek({ apiKey });
      return (modelId) => client(modelId);
    }
    case "moonshot": {
      // ADR-003: Moonshot/Kimi via the OpenAI-compatible provider + baseURL.
      const client = createOpenAI({ apiKey, baseURL: MOONSHOT_BASE_URL });
      return (modelId) => client(modelId);
    }
    default: {
      const _exhaustive: never = provider;
      throw new ProviderNotConfiguredError(String(_exhaustive));
    }
  }
};

let providerFactory: ProviderFactory = defaultProviderFactory;

/**
 * Test seam: override the provider factory so tests inject a mock model and
 * never perform a real SDK key call. Mirrors the F6 `__setResolveModelClient`
 * convention. NOT for production use.
 */
export function __setProviderFactory(factory: ProviderFactory | null): void {
  providerFactory = factory ?? defaultProviderFactory;
}

/**
 * Returns a configured provider client for the given workspace + provider.
 *
 * Reads the envelope via serviceDb (explicit workspaceId tenancy gate),
 * decrypts the key in memory, builds the client, and updates `last_used_at`.
 * Throws `ProviderNotConfiguredError` ("No key configured for {provider}") when
 * the workspace has no row for the provider.
 */
export async function getProviderClient(
  workspaceId: string,
  provider: AiProvider,
): Promise<ProviderClient> {
  const [row] = await serviceDb
    .select({
      id: aiProviderConfigs.id,
      encryptedKey: aiProviderConfigs.encryptedKey,
      keyIv: aiProviderConfigs.keyIv,
      keyTag: aiProviderConfigs.keyTag,
      encryptedDek: aiProviderConfigs.encryptedDek,
    })
    .from(aiProviderConfigs)
    .where(
      and(
        eq(aiProviderConfigs.workspaceId, workspaceId),
        eq(aiProviderConfigs.provider, provider),
      ),
    )
    .limit(1);

  if (!row) {
    throw new ProviderNotConfiguredError(provider);
  }

  // Decrypt to in-memory plaintext, hand it straight into the factory closure,
  // and never retain it in any outer scope.
  const plaintextKey = decryptProviderKey({
    encryptedKey: row.encryptedKey,
    keyIv: row.keyIv,
    keyTag: row.keyTag,
    encryptedDek: row.encryptedDek,
  });
  const client = providerFactory(provider, plaintextKey);

  // Stamp last_used_at (serviceDb, explicit workspaceId tenancy gate).
  await serviceDb
    .update(aiProviderConfigs)
    .set({ lastUsedAt: new Date() })
    .where(
      and(
        eq(aiProviderConfigs.workspaceId, workspaceId),
        eq(aiProviderConfigs.provider, provider),
      ),
    );

  return client;
}
