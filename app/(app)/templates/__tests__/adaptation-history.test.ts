import { describe, expect, it } from "vitest";

import type { AdaptationRow } from "../actions";
import {
  ADAPTATION_SNIPPET_MAX,
  adaptationModelLabel,
  adaptationSnippet,
  adaptationTimestamp,
  applyDeleteResult,
  removeAdaptation,
} from "../adaptation-history";

/**
 * Headless coverage for the adapt-dialog history presentation + delete-policy
 * helpers (PR-F7C-3b). These are the DOM-free transforms that back the history
 * list; the live streaming + clipboard + dialog UX is verified MANUALLY per the
 * F7 visual-close convention (no fragile RTL/DOM-clipboard tests, #760).
 */

function row(overrides: Partial<AdaptationRow> = {}): AdaptationRow {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    resultText: "Hola cliente",
    extraInstructions: null,
    provider: "google",
    modelId: "gemini-2.5-flash",
    createdAt: "2026-06-07T10:30:00.000Z",
    beautifiedHtml: null,
    emailSubject: null,
    emailPreheader: null,
    beautifiedPalette: null,
    ...overrides,
  };
}

describe("adaptationSnippet", () => {
  it("returns short prose unchanged", () => {
    expect(adaptationSnippet("Hola, esta es una propuesta.")).toBe(
      "Hola, esta es una propuesta.",
    );
  });

  it("strips markdown markers and collapses whitespace", () => {
    const md = "# Título\n\n- punto **uno**\n- punto _dos_";
    const snippet = adaptationSnippet(md);
    expect(snippet).not.toContain("#");
    expect(snippet).not.toContain("**");
    expect(snippet).not.toContain("_");
    expect(snippet).not.toContain("\n");
    expect(snippet).toContain("Título");
    expect(snippet).toContain("punto uno");
  });

  it("drops fenced code blocks", () => {
    const md = "Intro\n```js\nconst x = 1;\n```\nfin";
    const snippet = adaptationSnippet(md);
    expect(snippet).not.toContain("const x");
    expect(snippet).toContain("Intro");
    expect(snippet).toContain("fin");
  });

  it("truncates long text at a word boundary with an ellipsis", () => {
    const long = "palabra ".repeat(60).trim();
    const snippet = adaptationSnippet(long);
    expect(snippet.endsWith("…")).toBe(true);
    // body (sans the ellipsis) stays within the bound
    expect(snippet.length - 1).toBeLessThanOrEqual(ADAPTATION_SNIPPET_MAX);
    expect(snippet).not.toContain("  ");
  });

  it("respects a custom max", () => {
    const snippet = adaptationSnippet("uno dos tres cuatro cinco", 10);
    expect(snippet.endsWith("…")).toBe(true);
    expect(snippet.length).toBeLessThanOrEqual(11);
  });
});

describe("adaptationModelLabel", () => {
  it("joins provider and model", () => {
    expect(adaptationModelLabel(row())).toBe("google · gemini-2.5-flash");
  });

  it("uses whichever part is present", () => {
    expect(adaptationModelLabel(row({ provider: null }))).toBe(
      "gemini-2.5-flash",
    );
    expect(adaptationModelLabel(row({ modelId: null }))).toBe("google");
  });

  it("falls back to a neutral label when both are missing", () => {
    expect(
      adaptationModelLabel(row({ provider: null, modelId: null })),
    ).toBe("Modelo desconocido");
  });

  it("treats blank strings as missing", () => {
    expect(
      adaptationModelLabel(row({ provider: "  ", modelId: "" })),
    ).toBe("Modelo desconocido");
  });
});

describe("adaptationTimestamp", () => {
  it("formats a valid ISO date without throwing", () => {
    const out = adaptationTimestamp("2026-06-07T10:30:00.000Z");
    expect(typeof out).toBe("string");
    expect(out.length).toBeGreaterThan(0);
  });

  it("returns the raw value for an unparseable date", () => {
    expect(adaptationTimestamp("not-a-date")).toBe("not-a-date");
  });
});

describe("removeAdaptation", () => {
  it("drops the matching row immutably", () => {
    const a = row({ id: "a" });
    const b = row({ id: "b" });
    const rows = [a, b];
    const next = removeAdaptation(rows, "a");
    expect(next).toEqual([b]);
    expect(rows).toHaveLength(2); // original untouched
  });

  it("is a no-op for an unknown id", () => {
    const rows = [row({ id: "a" })];
    expect(removeAdaptation(rows, "zzz")).toEqual(rows);
  });
});

describe("applyDeleteResult", () => {
  const rows = [row({ id: "a" }), row({ id: "b" })];

  it("removes the row and surfaces a success toast on ok", () => {
    const outcome = applyDeleteResult(rows, "a", { ok: true });
    expect(outcome.removed).toBe(true);
    expect(outcome.rows.map((r) => r.id)).toEqual(["b"]);
    expect(outcome.toast).toEqual({
      kind: "success",
      message: "Adaptación eliminada",
    });
  });

  it("keeps the list and surfaces the server error toast on failure", () => {
    const outcome = applyDeleteResult(rows, "a", {
      ok: false,
      error: "No se encontró la adaptación.",
    });
    expect(outcome.removed).toBe(false);
    expect(outcome.rows).toBe(rows); // unchanged reference
    expect(outcome.toast).toEqual({
      kind: "error",
      message: "No se encontró la adaptación.",
    });
  });
});
