"use client";

import { useState, useTransition } from "react";

import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { setFeatureModel } from "@/app/actions/ai-settings";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import type { ProviderId } from "./provider-card";

export type FeatureId =
  | "adapt_template"
  | "summarize"
  | "suggest"
  | "extract_document";

/**
 * A manifest model already resolved for a feature by `getAvailableModels`
 * (lib/ai/manifest.ts): eligibility + reason are computed server-side in the
 * page, so this Client Component is a dumb renderer.
 */
export type FeatureModelOption = {
  provider: ProviderId;
  modelId: string;
  displayName: string;
  eligible: boolean;
  ineligibleReason: string | null;
};

const PROVIDER_LABELS: Record<ProviderId, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google Gemini",
  deepseek: "DeepSeek",
  moonshot: "Kimi (Moonshot)",
};

/**
 * Per-feature model Select row. Renders the per-provider options the page
 * resolved via getAvailableModels (PR2). Ineligible models are DISABLED with a
 * native `title` tooltip stating the reason (never hidden — design §9). onChange
 * calls the `setFeatureModel` Server Action.
 *
 * PR2: the eligibility + reason computation now lives in lib/ai/manifest.ts
 * (getAvailableModels), invoked by the page per configured provider + feature.
 * This component no longer derives eligibility itself.
 */
export function FeatureModelRow({
  feature,
  label,
  options,
  configuredProviders,
  currentProvider,
  currentModelId,
}: {
  feature: FeatureId;
  label: string;
  /** Options grouped by configured provider, eligibility already resolved. */
  options: Record<string, FeatureModelOption[]>;
  configuredProviders: ProviderId[];
  currentProvider: string | null;
  currentModelId: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState<string>(
    currentProvider && currentModelId
      ? `${currentProvider}:${currentModelId}`
      : "",
  );

  function handleChange(next: string) {
    setValue(next);
    const [provider, modelId] = next.split(":");
    startTransition(async () => {
      const result = await setFeatureModel({
        feature,
        provider: provider as ProviderId,
        modelId,
      });
      if (result.ok) {
        toast.success("Modelo actualizado");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  const hasConfigured = configuredProviders.length > 0;

  return (
    <div className="flex items-center justify-between gap-4 p-4">
      <span className="text-sm font-medium">{label}</span>
      <Select
        value={value}
        onValueChange={handleChange}
        disabled={pending || !hasConfigured}
      >
        <SelectTrigger className="w-64">
          <SelectValue
            placeholder={
              hasConfigured ? "Elegir modelo" : "Configura una key primero"
            }
          />
        </SelectTrigger>
        <SelectContent>
          {configuredProviders.map((provider) => {
            const models = options[provider] ?? [];
            if (models.length === 0) return null;
            return (
              <SelectGroup key={provider}>
                <SelectLabel>{PROVIDER_LABELS[provider]}</SelectLabel>
                {models.map((model) => (
                  <SelectItem
                    key={`${provider}:${model.modelId}`}
                    value={`${provider}:${model.modelId}`}
                    disabled={!model.eligible}
                    title={model.ineligibleReason ?? undefined}
                  >
                    {model.displayName}
                  </SelectItem>
                ))}
              </SelectGroup>
            );
          })}
        </SelectContent>
      </Select>
    </div>
  );
}
