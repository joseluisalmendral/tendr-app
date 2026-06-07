import { describe, expect, it } from "vitest";

import {
  asExtractionResult,
  deriveSteps,
  errorMessageFor,
  EXTRACTION_STEPS,
  resolveDocumentView,
} from "../document-view";

/**
 * Pure presentation logic behind the Documents tab (JobProgress / ExtractionView
 * / error states). Tested at the logic level — the project convention is to test
 * the functions behind components, not to render the DOM (no jsdom/RTL infra).
 *
 * Covers the spec slice C invariant: a failed job NEVER hangs the UI — every
 * non-running status resolves to a TERMINAL view, and a failed job ALWAYS yields
 * a non-empty, human-facing message (never a raw code or empty string).
 */

describe("resolveDocumentView — terminal state guarantee (gate c)", () => {
  it("maps failed -> 'failed' (never a spinner)", () => {
    expect(resolveDocumentView("failed", false)).toBe("failed");
    // Even if stale metadata exists, a failed job still shows the error.
    expect(resolveDocumentView("failed", true)).toBe("failed");
  });

  it("maps completed -> 'extracted'", () => {
    expect(resolveDocumentView("completed", false)).toBe("extracted");
  });

  it("maps pending/running -> 'progress'", () => {
    expect(resolveDocumentView("pending", false)).toBe("progress");
    expect(resolveDocumentView("running", false)).toBe("progress");
  });

  it("with no live job, shows existing metadata when present, else idle", () => {
    expect(resolveDocumentView(null, true)).toBe("extracted");
    expect(resolveDocumentView(null, false)).toBe("idle");
  });

  it("NO status maps to an indefinite spinner — every state is terminal or transient-with-progress", () => {
    const statuses = ["pending", "running", "completed", "failed", null] as const;
    for (const s of statuses) {
      const view = resolveDocumentView(s, false);
      // 'progress' is the only transient view and it renders a per-step list
      // (not an unbounded spinner). All others are terminal/idle.
      expect(["progress", "extracted", "failed", "idle"]).toContain(view);
    }
  });
});

describe("errorMessageFor — failed job always has an actionable message", () => {
  it("returns a known message for each taxonomy code", () => {
    for (const code of [
      "validation_error",
      "provider_error",
      "invalid_api_key",
      "document_error",
    ]) {
      const msg = errorMessageFor({ error_code: code });
      expect(msg.length).toBeGreaterThan(0);
    }
  });

  it("falls back to the structured message for an unknown code", () => {
    expect(errorMessageFor({ error_code: "weird", message: "boom" })).toBe(
      "boom",
    );
  });

  it("never returns an empty string, even for a null error", () => {
    expect(errorMessageFor(null).length).toBeGreaterThan(0);
    expect(errorMessageFor({}).length).toBeGreaterThan(0);
  });

  it("ships NO voseo in any touched copy — neutral Spanish only (R-COPY)", () => {
    // Every error_code path + the default + the structured-message fallback.
    const messages = [
      errorMessageFor(null),
      errorMessageFor({}),
      errorMessageFor({ error_code: "validation_error" }),
      errorMessageFor({ error_code: "provider_error" }),
      errorMessageFor({ error_code: "invalid_api_key" }),
      errorMessageFor({ error_code: "document_error" }),
    ];
    // Explicit voseo forms seen or likely in this copy surface. A generic
    // accented-ending regex false-positives on neutral words ("más", "falló")
    // because JS \b is ASCII-only — keep this a curated list.
    const voseoForms =
      /Volvé|Verificá|Elegí|Subí|Hacé|Probá|Mirá|Tenés|Podés|Querés/;
    for (const msg of messages) {
      expect(msg).not.toMatch(voseoForms);
    }
    // The neutral form is present where the voseo one used to be.
    expect(errorMessageFor({ error_code: "provider_error" })).toContain(
      "Vuelve a intentarlo",
    );
    expect(errorMessageFor({ error_code: "unknown_code" })).toContain(
      "Vuelve a intentarlo",
    );
  });
});

describe("deriveSteps — per-step progress from jobs.progress", () => {
  it("marks completed steps done and the next one active while running", () => {
    const steps = deriveSteps(
      [
        { step: "mark-running", at: "t1" },
        { step: "lookup-model", at: "t2" },
      ],
      "running",
    );
    expect(steps.find((s) => s.step === "mark-running")?.state).toBe("done");
    expect(steps.find((s) => s.step === "lookup-model")?.state).toBe("done");
    expect(steps.find((s) => s.step === "create-signed-url")?.state).toBe(
      "active",
    );
    expect(steps.find((s) => s.step === "persist")?.state).toBe("pending");
  });

  it("leaves NO step active on a terminal (failed) job — no dangling spinner", () => {
    const steps = deriveSteps([{ step: "mark-running", at: "t1" }], "failed");
    expect(steps.some((s) => s.state === "active")).toBe(false);
  });

  it("leaves NO step active on a completed job", () => {
    const steps = deriveSteps(
      EXTRACTION_STEPS.map((step) => ({ step, at: "t" })),
      "completed",
    );
    expect(steps.every((s) => s.state === "done")).toBe(true);
  });
});

describe("asExtractionResult — defensive narrowing", () => {
  it("accepts a well-formed extraction payload", () => {
    const value = {
      fechasClave: [{ fecha: "2026-01-01", descripcion: "Inicio" }],
      importes: [{ cantidad: 100, moneda: "EUR", descripcion: "Honorarios" }],
      partesImplicadas: [{ nombre: "Acme", rol: "Cliente" }],
      resumen: "Contrato de servicios.",
    };
    expect(asExtractionResult(value)).toEqual(value);
  });

  it("rejects malformed / partial payloads", () => {
    expect(asExtractionResult(null)).toBeNull();
    expect(asExtractionResult({})).toBeNull();
    expect(asExtractionResult({ resumen: "x" })).toBeNull();
    expect(asExtractionResult("not an object")).toBeNull();
  });
});
