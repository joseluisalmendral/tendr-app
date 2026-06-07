"use client";

import { useState, useTransition } from "react";

import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { clearFeatureModel, setFeatureModel } from "@/app/actions/ai-settings";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import type { ProviderId } from "./provider-card";

export type FeatureId =
  | "adapt_template"
  | "summarize"
  | "suggest"
  | "extract_document"
  | "beautify_email";

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
 * Sentinel Select value for the "Default" option (F7c finding 4a). Choosing it
 * calls `clearFeatureModel`, which DELETEs the override so `getModelForFeature`
 * falls back to the manifest default (gemini-3.5-flash). It can't collide with a
 * real `provider:modelId` value because no provider id contains a colon-prefix
 * underscore pair like this.
 */
const DEFAULT_OPTION = "__default__";
const DEFAULT_OPTION_LABEL = "Default (gemini-3.5-flash)";

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
  // No override -> the feature is on the manifest default, so the Select shows
  // the "Default" sentinel rather than an empty placeholder.
  const [value, setValue] = useState<string>(
    currentProvider && currentModelId
      ? `${currentProvider}:${currentModelId}`
      : DEFAULT_OPTION,
  );

  function handleChange(next: string) {
    setValue(next);
    startTransition(async () => {
      // "Default" clears the override (falls back to the manifest default);
      // any other value sets an explicit provider:modelId override.
      const result =
        next === DEFAULT_OPTION
          ? await clearFeatureModel({ feature })
          : await (async () => {
              const [provider, modelId] = next.split(":");
              return setFeatureModel({
                feature,
                provider: provider as ProviderId,
                modelId,
              });
            })();
      if (result.ok) {
        toast.success(
          next === DEFAULT_OPTION
            ? "Volviste al modelo por defecto"
            : "Modelo actualizado",
        );
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
          <SelectGroup>
            <SelectItem value={DEFAULT_OPTION}>
              {DEFAULT_OPTION_LABEL}
            </SelectItem>
          </SelectGroup>
          <SelectSeparator />
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
