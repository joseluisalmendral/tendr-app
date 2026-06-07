import { describe, expect, it } from "vitest";

import {
  EMAIL_PALETTES,
  EMAIL_PALETTE_IDS,
} from "../email-palettes";
import {
  PALETTE_SWATCHES,
  PREVIEW_WIDTHS,
  buildDownloadFilename,
  buildRichTextClipboardPayload,
  previewWidth,
  toPaletteSwatch,
} from "../beautify-export";

/**
 * Pure-helper coverage for the beautify_email UI (PR-F7C-4b). The live iframe
 * render + real clipboard write + Blob download are MANUAL (vitest is the node
 * env — no jsdom/clipboard); these tests pin the load-bearing transforms.
 */

describe("previewWidth", () => {
  it("maps the device toggle to the canonical email widths", () => {
    expect(PREVIEW_WIDTHS.desktop).toBe(600);
    expect(PREVIEW_WIDTHS.mobile).toBe(360);
    expect(previewWidth("desktop")).toBe(600);
    expect(previewWidth("mobile")).toBe(360);
  });
});

describe("toPaletteSwatch / PALETTE_SWATCHES", () => {
  it("exposes one swatch per palette in palette order with bg/surface/accent", () => {
    expect(PALETTE_SWATCHES.map((s) => s.id)).toEqual([...EMAIL_PALETTE_IDS]);
    expect(PALETTE_SWATCHES).toHaveLength(EMAIL_PALETTES.length);
    for (let i = 0; i < EMAIL_PALETTES.length; i++) {
      const palette = EMAIL_PALETTES[i];
      const swatch = PALETTE_SWATCHES[i];
      expect(swatch.bg).toBe(palette.bg);
      expect(swatch.surface).toBe(palette.surface);
      expect(swatch.accent).toBe(palette.accent);
      expect(swatch.name).toBe(palette.name);
    }
  });

  it("builds an accessible label naming bg + accent", () => {
    const swatch = toPaletteSwatch({
      id: "niebla",
      name: "Niebla",
      bg: "#f5f5f4",
      surface: "#ffffff",
      text: "#1c1917",
      accent: "#2563eb",
      accentText: "#ffffff",
    });
    expect(swatch.ariaLabel).toContain("Niebla");
    expect(swatch.ariaLabel).toContain("#f5f5f4");
    expect(swatch.ariaLabel).toContain("#2563eb");
  });
});

describe("buildDownloadFilename", () => {
  it("slugifies the subject, strips accents, and ends in .html", () => {
    expect(buildDownloadFilename("Propuesta para Acción Café")).toBe(
      "propuesta-para-accion-cafe.html",
    );
  });

  it("falls back to a neutral base for an empty or blank subject", () => {
    expect(buildDownloadFilename("")).toBe("email.html");
    expect(buildDownloadFilename("   ")).toBe("email.html");
  });

  it("collapses unsafe characters and never leaves a trailing hyphen", () => {
    expect(buildDownloadFilename("Hola / Mundo!! ??")).toBe("hola-mundo.html");
  });

  it("bounds the length so a long subject cannot produce an unwieldy name", () => {
    const long = "palabra ".repeat(40);
    const name = buildDownloadFilename(long);
    expect(name.endsWith(".html")).toBe(true);
    expect(name.replace(/\.html$/, "").length).toBeLessThanOrEqual(60);
    expect(name).not.toContain("-.html");
  });

  it("uses the provided fallback when the subject yields nothing", () => {
    expect(buildDownloadFilename("###", "mi-email")).toBe("mi-email.html");
  });
});

describe("buildRichTextClipboardPayload", () => {
  it("carries the html part verbatim and the subject as the plain fallback", () => {
    const html = "<html><body><p>Hola</p></body></html>";
    const payload = buildRichTextClipboardPayload(html, "Asunto");
    expect(payload["text/html"]).toBe(html);
    expect(payload["text/plain"]).toBe("Asunto");
  });

  it("falls back to a neutral plain string when the subject is blank", () => {
    const payload = buildRichTextClipboardPayload("<html></html>", "   ");
    expect(payload["text/plain"]).toBe("Email");
  });
});
