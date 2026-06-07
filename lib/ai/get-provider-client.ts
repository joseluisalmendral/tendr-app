import "server-only";

import {
  createGoogleGenerativeAI,
  type GoogleGenerativeAIProvider,
} from "@ai-sdk/google";

import type { aiProvider } from "@/db/schema/enums";

/**
 * Provider client factory for AI features.
 *
 * The signature `getProviderClient(workspaceId, provider)` is FROZEN for F7:
 * F6 ships only the Google system key (free tier) read from the environment,
 * but F7 will swap the body for per-workspace BYO key decryption (envelope
 * AES-256-GCM from `ai_provider_configs`) WITHOUT changing this signature, so
 * the worker call site stays stable across phases.
 */

export type AiProvider = (typeof aiProvider.enumValues)[number];

/**
 * Thrown when a workspace requests a provider that is not configured. In F6
 * only `google` is wired; any other provider is unconfigured. F7 will raise
 * this only when a workspace genuinely lacks a key for the provider.
 */
export class ProviderNotConfiguredError extends Error {
  constructor(provider: string) {
    super(`Provider "${provider}" is not configured.`);
    this.name = "ProviderNotConfiguredError";
  }
}

/**
 * Returns a configured provider client for the given workspace + provider.
 *
 * F6: only `google` is supported, using the system key from
 * `GOOGLE_GENERATIVE_AI_API_KEY`. `workspaceId` is accepted now so the F7
 * swap to per-workspace BYO keys requires no call-site change.
 */
export function getProviderClient(
  // `workspaceId` is reserved for the F7 BYO-key lookup; the signature is
  // frozen now so the worker call site does not change. Prefixed with `_` so
  // lint accepts the currently-unused parameter.
  _workspaceId: string,
  provider: AiProvider,
): GoogleGenerativeAIProvider {
  if (provider !== "google") {
    // TODO(F7): replace this env-key body with per-workspace BYO key
    // decryption. Look up `ai_provider_configs` for (workspaceId, provider),
    // decrypt the AES-256-GCM envelope, and construct the matching provider
    // client (openai/anthropic/google/deepseek/moonshot). The plaintext key
    // MUST stay inside this server-only module and never be logged or traced.
    throw new ProviderNotConfiguredError(provider);
  }

  return createGoogleGenerativeAI({
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
  });
}
