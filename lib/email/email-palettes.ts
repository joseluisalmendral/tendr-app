/**
 * Curated email color palettes for the beautify_email feature (F7c PR-F7C-4a,
 * plan-beautify #778).
 *
 * These are NOT a free color picker: each palette is a tonal SYSTEM
 * (bg / surface / text / accent / accentText) whose contrast ratios were
 * validated to pass WCAG AA — body text >= 4.5:1 against its surface, accents
 * and CTA buttons >= 3:1, and the CTA label on the accent >= 4.5:1. The exact
 * ratios are PINNED in email-palettes.test.ts so a token edit that breaks
 * accessibility fails CI.
 *
 * This module is the SINGLE SOURCE of the palette set: the beautify seam feeds
 * the chosen palette's tokens to the model, and the UI (PR-F7C-4b) renders the
 * same `id`/`name`/swatches. It is dependency-free and client-safe (no server
 * imports) so both the server seam and the browser bundle can import it.
 */

/** A single email palette as a tonal system. All values are hex colors. */
export interface EmailPalette {
  /** Stable id persisted in template_adaptations.beautified_palette. */
  id: string;
  /** User-facing name (neutral Spanish) shown on the swatch. */
  name: string;
  /** Page/canvas background behind the email card. */
  bg: string;
  /** Card surface the body text sits on. */
  surface: string;
  /** Body text color (>= 4.5:1 on surface). */
  text: string;
  /** Accent / CTA button background (>= 3:1 on surface). */
  accent: string;
  /** CTA label color on the accent (>= 4.5:1 on accent). */
  accentText: string;
}

/**
 * The 8 validated palettes (plan-beautify #778). Order is the swatch order in
 * the picker: 6 light systems first, then 2 dark systems.
 */
export const EMAIL_PALETTES: readonly EmailPalette[] = [
  {
    id: "niebla",
    name: "Niebla",
    bg: "#f5f5f4",
    surface: "#ffffff",
    text: "#1c1917",
    accent: "#2563eb",
    accentText: "#ffffff",
  },
  {
    id: "oceano",
    name: "Océano",
    bg: "#f0f6ff",
    surface: "#ffffff",
    text: "#0f2742",
    accent: "#1d4ed8",
    accentText: "#ffffff",
  },
  {
    id: "bosque",
    name: "Bosque",
    bg: "#f1f7f2",
    surface: "#ffffff",
    text: "#14271a",
    accent: "#15803d",
    accentText: "#ffffff",
  },
  {
    id: "arena",
    name: "Arena",
    bg: "#faf6f0",
    surface: "#ffffff",
    text: "#2b2018",
    accent: "#b45309",
    accentText: "#ffffff",
  },
  {
    id: "lavanda",
    name: "Lavanda",
    bg: "#f6f4fb",
    surface: "#ffffff",
    text: "#241a33",
    accent: "#6d28d9",
    accentText: "#ffffff",
  },
  {
    id: "coral",
    name: "Coral",
    bg: "#fdf3f3",
    surface: "#ffffff",
    text: "#3a1414",
    accent: "#be123c",
    accentText: "#ffffff",
  },
  {
    id: "pizarra",
    name: "Pizarra",
    bg: "#1a1a1a",
    surface: "#242424",
    text: "#f5f5f5",
    accent: "#60a5fa",
    accentText: "#0b1220",
  },
  {
    id: "medianoche",
    name: "Medianoche",
    bg: "#0f172a",
    surface: "#1e293b",
    text: "#e2e8f0",
    accent: "#7dd3fc",
    accentText: "#082032",
  },
] as const;

/** Set of valid palette ids — used by the seam to validate the chosen palette. */
export const EMAIL_PALETTE_IDS: readonly string[] = EMAIL_PALETTES.map(
  (p) => p.id,
);

/** Looks up a palette by id; returns undefined for an unknown id. */
export function getEmailPalette(id: string): EmailPalette | undefined {
  return EMAIL_PALETTES.find((p) => p.id === id);
}
