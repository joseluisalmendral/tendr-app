import { EMAIL_PALETTES, type EmailPalette } from "./email-palettes";

/**
 * Pure, DOM-free helpers for the beautify_email UI (F7c PR-F7C-4b,
 * plan-beautify #778). Kept apart from the React panel so the load-bearing logic
 * — the export filename, the clipboard payload shape, the preview viewport
 * widths, and the palette-to-swatch mapping — is unit-testable headlessly (vitest
 * node env). The live iframe render + real clipboard write + Blob download are
 * verified MANUALLY (no jsdom/clipboard fragility per the F7 #760 convention).
 *
 * SECRETS/PII: the generated HTML / subject / preheader are the user's own
 * RLS-scoped workspace PII. These helpers only transform strings the user
 * already sees in their own UI — nothing is logged or sent anywhere.
 */

/** Preview viewport widths (px) for the desktop / mobile iframe toggle. */
export const PREVIEW_WIDTHS = {
  /** Email canonical max-width (plan-beautify #778). */
  desktop: 600,
  /** Narrow phone width; the email's own media queries reflow within it. */
  mobile: 360,
} as const;

export type PreviewDevice = keyof typeof PREVIEW_WIDTHS;

/** Resolves the iframe width (px) for a preview device. */
export function previewWidth(device: PreviewDevice): number {
  return PREVIEW_WIDTHS[device];
}

/**
 * A swatch descriptor for the palette picker: the three tokens the swatch shows
 * (background, surface, accent) plus the id/name. Decoupling this from the React
 * component lets the picker render a dumb map and keeps the mapping tested.
 */
export type PaletteSwatch = {
  id: string;
  name: string;
  bg: string;
  surface: string;
  accent: string;
  /** Accessible label for the swatch button (neutral Spanish). */
  ariaLabel: string;
};

/** Maps a palette to its swatch descriptor (bg / surface / accent shown). */
export function toPaletteSwatch(palette: EmailPalette): PaletteSwatch {
  return {
    id: palette.id,
    name: palette.name,
    bg: palette.bg,
    surface: palette.surface,
    accent: palette.accent,
    ariaLabel: `Paleta ${palette.name}: fondo ${palette.bg}, acento ${palette.accent}`,
  };
}

/** The full swatch list, in palette order — the picker renders this directly. */
export const PALETTE_SWATCHES: PaletteSwatch[] =
  EMAIL_PALETTES.map(toPaletteSwatch);

/**
 * Builds a safe `.html` download filename from the email subject. Falls back to
 * a neutral base when the subject is empty/blank, slugifies accents and unsafe
 * filesystem characters, collapses separators, and bounds the length so a long
 * subject can't produce an unwieldy name. Always ends in `.html`.
 */
export function buildDownloadFilename(
  subject: string,
  fallback = "email",
): string {
  const base = slugify(subject) || slugify(fallback) || "email";
  const bounded = base.slice(0, 60).replace(/-+$/g, "") || "email";
  return `${bounded}.html`;
}

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics (combining marks)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-") // unsafe chars -> hyphen
    .replace(/^-+|-+$/g, ""); // trim hyphens
}

/**
 * The clipboard payload for "Copiar texto enriquecido": a `text/html` part so it
 * pastes formatted into Gmail/rich editors, plus a `text/plain` fallback (the
 * subject + a short note) for plain targets. The panel wraps these in a
 * `ClipboardItem`; this builder keeps the MIME-part shape testable without the
 * browser Clipboard API.
 */
export type RichTextClipboardPayload = {
  "text/html": string;
  "text/plain": string;
};

export function buildRichTextClipboardPayload(
  html: string,
  subject: string,
): RichTextClipboardPayload {
  return {
    "text/html": html,
    "text/plain": subject.trim().length > 0 ? subject : "Email",
  };
}
