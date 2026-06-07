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

export type ManifestModel = {
  provider: string;
  modelId: string;
  displayName: string;
  supportsPdf: boolean | null;
  supportsStreaming: boolean | null;
};

const PROVIDER_LABELS: Record<ProviderId, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google Gemini",
  deepseek: "DeepSeek",
  moonshot: "Kimi (Moonshot)",
};

/**
 * Per-feature model Select row. Lists the manifest models grouped by the
 * workspace's CONFIGURED providers; ineligible models are DISABLED with a native
 * `title` tooltip stating the reason (never hidden — design §9). onChange calls
 * the `setFeatureModel` Server Action.
 *
 * PR1b NOTE: this renders directly against the manifest passed by the page. PR2
 * introduces lib/ai/manifest.ts (getAvailableModels) which centralises the
 * eligibility + reason computation; the Select population is re-verified there.
 * Eligibility heuristic here: features that stream (adapt_template, summarize)
 * mark non-streaming models ineligible. extract_document accepts any model
 * because the F6 pdf-parse fallback covers non-PDF models (decision #757).
 */
export function FeatureModelRow({
  feature,
  label,
  manifest,
  configuredProviders,
  currentProvider,
  currentModelId,
}: {
  feature: FeatureId;
  label: string;
  manifest: ManifestModel[];
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

  const requiresStreaming =
    feature === "adapt_template" || feature === "summarize";

  function ineligibleReason(model: ManifestModel): string | null {
    if (requiresStreaming && model.supportsStreaming === false) {
      return "Este modelo no soporta streaming";
    }
    return null;
  }

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
            const models = manifest.filter((m) => m.provider === provider);
            if (models.length === 0) return null;
            return (
              <SelectGroup key={provider}>
                <SelectLabel>{PROVIDER_LABELS[provider]}</SelectLabel>
                {models.map((model) => {
                  const reason = ineligibleReason(model);
                  return (
                    <SelectItem
                      key={`${provider}:${model.modelId}`}
                      value={`${provider}:${model.modelId}`}
                      disabled={reason !== null}
                      title={reason ?? undefined}
                    >
                      {model.displayName}
                    </SelectItem>
                  );
                })}
              </SelectGroup>
            );
          })}
        </SelectContent>
      </Select>
    </div>
  );
}
