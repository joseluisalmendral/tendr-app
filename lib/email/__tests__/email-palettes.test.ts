import { describe, expect, it } from "vitest";

import {
  EMAIL_PALETTES,
  EMAIL_PALETTE_IDS,
  getEmailPalette,
} from "../email-palettes";

/**
 * Pins the WCAG AA contrast ratios for the curated email palettes
 * (plan-beautify #778). The ratios are COMPUTED here (not copied from the plan)
 * so a token edit that breaks accessibility fails this test:
 *   - body text on surface  >= 4.5:1
 *   - accent on surface      >= 3:1   (large text / button surface)
 *   - CTA label on accent    >= 4.5:1
 *
 * Relative luminance + contrast ratio per WCAG 2.x definitions.
 */

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new Error(`Invalid hex color: ${hex}`);
  const int = parseInt(m[1], 16);
  const r = (int >> 16) & 0xff;
  const g = (int >> 8) & 0xff;
  const b = int & 0xff;
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Round to 2dp so the pinned table is stable across runs. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

describe("EMAIL_PALETTES", () => {
  it("exposes exactly the 8 curated palettes with the expected ids", () => {
    expect(EMAIL_PALETTES).toHaveLength(8);
    expect(EMAIL_PALETTE_IDS).toEqual([
      "niebla",
      "oceano",
      "bosque",
      "arena",
      "lavanda",
      "coral",
      "pizarra",
      "medianoche",
    ]);
  });

  it("getEmailPalette resolves a known id and rejects an unknown one", () => {
    expect(getEmailPalette("niebla")?.name).toBe("Niebla");
    expect(getEmailPalette("does-not-exist")).toBeUndefined();
  });

  it("every palette passes WCAG AA: body >= 4.5, accent >= 3, CTA label >= 4.5", () => {
    for (const p of EMAIL_PALETTES) {
      expect(contrast(p.text, p.surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(p.accent, p.surface)).toBeGreaterThanOrEqual(3);
      expect(contrast(p.accentText, p.accent)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("pins the validated contrast ratios (#778) so a token drift fails CI", () => {
    const table = Object.fromEntries(
      EMAIL_PALETTES.map((p) => [
        p.id,
        {
          textOnSurface: round2(contrast(p.text, p.surface)),
          accentOnSurface: round2(contrast(p.accent, p.surface)),
          ctaLabelOnAccent: round2(contrast(p.accentText, p.accent)),
        },
      ]),
    );

    expect(table).toEqual({
      niebla: { textOnSurface: 17.49, accentOnSurface: 5.17, ctaLabelOnAccent: 5.17 },
      oceano: { textOnSurface: 15.12, accentOnSurface: 6.7, ctaLabelOnAccent: 6.7 },
      bosque: { textOnSurface: 15.73, accentOnSurface: 5.02, ctaLabelOnAccent: 5.02 },
      arena: { textOnSurface: 15.88, accentOnSurface: 5.02, ctaLabelOnAccent: 5.02 },
      lavanda: { textOnSurface: 16.53, accentOnSurface: 7.1, ctaLabelOnAccent: 7.1 },
      coral: { textOnSurface: 16.28, accentOnSurface: 6.29, ctaLabelOnAccent: 6.29 },
      pizarra: { textOnSurface: 14.24, accentOnSurface: 6.11, ctaLabelOnAccent: 7.36 },
      medianoche: {
        textOnSurface: 11.87,
        accentOnSurface: 8.77,
        ctaLabelOnAccent: 9.97,
      },
    });
  });
});
