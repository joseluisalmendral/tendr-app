"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

import {
  CheckIcon,
  CopyIcon,
  DesktopIcon,
  DeviceMobileIcon,
  DownloadSimpleIcon,
  PaletteIcon,
  SparkleIcon,
  SpinnerGapIcon,
} from "@phosphor-icons/react";
import { toast } from "sonner";

import { beautifyEmail } from "@/app/actions/ai";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  PALETTE_SWATCHES,
  buildDownloadFilename,
  buildRichTextClipboardPayload,
  previewWidth,
  type PreviewDevice,
} from "@/lib/email/beautify-export";
import { EMAIL_PALETTE_IDS } from "@/lib/email/email-palettes";
import { cn } from "@/lib/utils";

/**
 * "Convertir en email" panel (F7c PR-F7C-4b, decision #777, plan-beautify #778).
 * Turns a persisted adaptation into a professional HTML email:
 *   - pick one of the 8 curated palettes (swatch buttons showing bg/surface/accent);
 *   - generate via the beautifyEmail Server Action (PR-F7C-4a seam);
 *   - preview the result in a SANDBOXED iframe (desktop 600px / mobile 360px);
 *   - copy HTML, copy rich text (pastes formatted into Gmail), download .html;
 *   - regenerate with a different palette WITHOUT re-adapting (the seam overwrites
 *     the beautified_* columns in place from the already-stored result_text).
 *
 * SECURITY (BINDING boundary — decision #777): the generated HTML is rendered
 * ONLY inside `<iframe sandbox="" srcDoc={html}>`. The EMPTY sandbox is maximally
 * restrictive — NO allow-scripts (JS inert) and NO allow-same-origin (no cookie /
 * storage / parent DOM access). This is defense-in-depth on top of the server
 * sanitize-html pass. NEVER render the HTML via dangerouslySetInnerHTML, and
 * NEVER widen the sandbox attribute.
 *
 * SECRETS/PII: subject / preheader / HTML are the user's own RLS-scoped workspace
 * PII, shown only here in their own UI — never logged or traced.
 */

type GeneratedEmail = {
  subject: string;
  preheader: string;
  html: string;
  paletteId: string;
};

export function BeautifyEmailPanel({
  adaptationId,
  initial,
  onGenerated,
}: {
  adaptationId: string;
  /** Previously generated email for this adaptation (re-opened from history). */
  initial?: GeneratedEmail | null;
  /** Notifies the parent so it can refresh persisted state after a generation. */
  onGenerated?: (email: GeneratedEmail) => void;
}) {
  const [selectedPalette, setSelectedPalette] = useState<string>(
    initial?.paletteId && EMAIL_PALETTE_IDS.includes(initial.paletteId)
      ? initial.paletteId
      : PALETTE_SWATCHES[0].id,
  );
  const [email, setEmail] = useState<GeneratedEmail | null>(initial ?? null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [device, setDevice] = useState<PreviewDevice>("desktop");

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    try {
      const result = await beautifyEmail({
        adaptationId,
        paletteId: selectedPalette,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const next: GeneratedEmail = {
        subject: result.subject,
        preheader: result.preheader,
        html: result.html,
        paletteId: result.paletteId,
      };
      setEmail(next);
      onGenerated?.(next);
      if (result.budgetWarning) {
        toast.warning("Has superado el 80% del budget mensual de IA.");
      }
    } catch {
      setError("No se pudo generar el email. Inténtalo de nuevo.");
    } finally {
      setGenerating(false);
    }
  }

  const hasEmail = email !== null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <span className="flex items-center gap-2 text-sm font-medium">
          <PaletteIcon />
          Paleta del email
        </span>
        <PalettePicker
          selected={selectedPalette}
          disabled={generating}
          onSelect={setSelectedPalette}
        />
      </div>

      <div>
        <Button type="button" onClick={handleGenerate} disabled={generating}>
          {generating ? (
            <SpinnerGapIcon className="animate-spin" data-icon="inline-start" />
          ) : (
            <SparkleIcon weight="fill" data-icon="inline-start" />
          )}
          {generating
            ? "Generando…"
            : hasEmail
              ? "Regenerar con esta paleta"
              : "Convertir en email"}
        </Button>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>No se pudo generar el email</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {email ? (
        <EmailResult
          email={email}
          device={device}
          onDeviceChange={setDevice}
        />
      ) : null}
    </div>
  );
}

function PalettePicker({
  selected,
  disabled,
  onSelect,
}: {
  selected: string;
  disabled: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Paleta del email"
      className="flex flex-wrap gap-2"
    >
      {PALETTE_SWATCHES.map((swatch) => {
        const active = swatch.id === selected;
        return (
          <button
            key={swatch.id}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={swatch.ariaLabel}
            disabled={disabled}
            onClick={() => onSelect(swatch.id)}
            className={cn(
              "flex flex-col items-center gap-1 rounded-md border p-2 transition-colors",
              "focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
              "disabled:pointer-events-none disabled:opacity-50",
              active
                ? "border-primary ring-2 ring-primary/40"
                : "border-border hover:border-primary/50",
            )}
          >
            <span
              className="flex size-9 items-center justify-center rounded"
              style={{ backgroundColor: swatch.bg }}
            >
              <span
                className="flex size-6 items-center justify-center rounded-sm"
                style={{ backgroundColor: swatch.surface }}
              >
                <span
                  className="size-3 rounded-full"
                  style={{ backgroundColor: swatch.accent }}
                />
              </span>
            </span>
            <span className="text-xs">{swatch.name}</span>
          </button>
        );
      })}
    </div>
  );
}

function EmailResult({
  email,
  device,
  onDeviceChange,
}: {
  email: GeneratedEmail;
  device: PreviewDevice;
  onDeviceChange: (device: PreviewDevice) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 rounded-md border p-3">
        <CopyField label="Asunto" value={email.subject} />
        <CopyField label="Preheader" value={email.preheader} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs
          value={device}
          onValueChange={(v) => onDeviceChange(v as PreviewDevice)}
        >
          <TabsList aria-label="Ancho de previsualización">
            <TabsTrigger value="desktop">
              <DesktopIcon data-icon="inline-start" />
              Escritorio
            </TabsTrigger>
            <TabsTrigger value="mobile">
              <DeviceMobileIcon data-icon="inline-start" />
              Móvil
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <ExportActions html={email.html} subject={email.subject} />
      </div>

      <EmailPreview html={email.html} device={device} />
    </div>
  );
}

/**
 * Sandboxed preview. The empty `sandbox` attribute is the BINDING render-time
 * security boundary (decision #777): scripts cannot run and the frame has no
 * same-origin access. The iframe element width switches between the desktop and
 * mobile viewport; the email's own media queries reflow within it.
 */
function EmailPreview({
  html,
  device,
}: {
  html: string;
  device: PreviewDevice;
}) {
  const frameStyle: CSSProperties = {
    width: previewWidth(device),
    maxWidth: "100%",
  };
  return (
    <div className="flex justify-center overflow-x-auto rounded-md border bg-muted/40 p-3">
      <iframe
        // SECURITY: empty sandbox = maximally restrictive. Do NOT add
        // allow-scripts or allow-same-origin.
        sandbox=""
        srcDoc={html}
        title="Previsualización del email"
        style={frameStyle}
        className="h-[28rem] rounded border-0 bg-white"
      />
    </div>
  );
}

function ExportActions({ html, subject }: { html: string; subject: string }) {
  async function handleCopyHtml() {
    try {
      await navigator.clipboard.writeText(html);
      toast.success("HTML copiado al portapapeles.");
    } catch {
      toast.error("No se pudo copiar el HTML.");
    }
  }

  async function handleCopyRichText() {
    const payload = buildRichTextClipboardPayload(html, subject);
    try {
      const item = new ClipboardItem({
        "text/html": new Blob([payload["text/html"]], { type: "text/html" }),
        "text/plain": new Blob([payload["text/plain"]], { type: "text/plain" }),
      });
      await navigator.clipboard.write([item]);
      toast.success("Email copiado. Pégalo en Gmail con formato.");
    } catch {
      toast.error("No se pudo copiar el texto enriquecido.");
    }
  }

  function handleDownload() {
    try {
      const blob = new Blob([html], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = buildDownloadFilename(subject);
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("No se pudo descargar el archivo.");
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" size="sm" onClick={handleCopyHtml}>
        <CopyIcon data-icon="inline-start" />
        Copiar HTML
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleCopyRichText}
      >
        <CopyIcon data-icon="inline-start" />
        Copiar texto enriquecido
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={handleDownload}>
        <DownloadSimpleIcon data-icon="inline-start" />
        Descargar .html
      </Button>
    </div>
  );
}

/** A read-only labelled value with a copy-to-clipboard button. */
function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("No se pudo copiar al portapapeles.");
    }
  }

  const Icon = copied ? CheckIcon : CopyIcon;

  return (
    <div className="flex items-center gap-2">
      <div className="flex flex-1 flex-col gap-0.5 overflow-hidden">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="truncate text-sm">{value}</span>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`Copiar ${label.toLowerCase()}`}
        onClick={handleCopy}
      >
        <Icon />
      </Button>
    </div>
  );
}
