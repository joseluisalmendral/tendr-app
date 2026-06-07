import type { AdaptationDeleteResult, AdaptationRow } from "./actions";

/**
 * Pure, DOM-free presentation helpers for the adapt dialog's history list
 * (PR-F7C-3b). Kept apart from adapt-dialog.tsx so the snippet/meta/label logic
 * is unit-testable headlessly (vitest node env) — the live streaming + clipboard
 * UX is verified MANUALLY per the F7 visual-close convention, but these pure
 * transforms are honest deterministic coverage.
 *
 * AdaptationRow is the workspace-scoped row shape returned by
 * listAdaptationsAction; resultText / extraInstructions are the user's own
 * tenant PII and only ever rendered in their own UI — never logged or traced.
 */

/** Max characters shown in a collapsed history row preview before the ellipsis. */
export const ADAPTATION_SNIPPET_MAX = 140;

/**
 * Collapses an adaptation's markdown body into a single-line plain-text preview
 * for the collapsed history row. Strips the most common markdown noise (heading
 * hashes, emphasis/bullet markers) and whitespace runs so the snippet reads as
 * prose, then truncates at a word-ish boundary with an ellipsis.
 */
export function adaptationSnippet(
  resultText: string,
  max: number = ADAPTATION_SNIPPET_MAX,
): string {
  const flattened = resultText
    .replace(/```[\s\S]*?```/g, " ") // fenced code blocks
    .replace(/[#>*_`~-]+/g, " ") // markdown markers
    .replace(/\s+/g, " ")
    .trim();

  if (flattened.length <= max) return flattened;

  const sliced = flattened.slice(0, max);
  const lastSpace = sliced.lastIndexOf(" ");
  const head = lastSpace > max * 0.6 ? sliced.slice(0, lastSpace) : sliced;
  return `${head.trimEnd()}…`;
}

/**
 * Human-readable "provider · model" label for a history row. Falls back to a
 * neutral placeholder when the row predates provider/model capture (both null).
 */
export function adaptationModelLabel(row: AdaptationRow): string {
  const parts = [row.provider, row.modelId].filter(
    (p): p is string => Boolean(p && p.trim().length > 0),
  );
  return parts.length > 0 ? parts.join(" · ") : "Modelo desconocido";
}

/** Removes the adaptation with `id` from a history list (immutable). */
export function removeAdaptation(
  rows: AdaptationRow[],
  id: string,
): AdaptationRow[] {
  return rows.filter((r) => r.id !== id);
}

/**
 * Decides how a delete action result affects the local history list + the toast
 * the row should surface. Keeps the optimistic-delete policy (drop the row only
 * on success; on failure keep it and show the server error) in one DOM-free,
 * testable place — the row component just applies the outcome.
 */
export type DeleteOutcome = {
  rows: AdaptationRow[];
  removed: boolean;
  toast: { kind: "success" | "error"; message: string };
};

export function applyDeleteResult(
  rows: AdaptationRow[],
  id: string,
  result: AdaptationDeleteResult,
): DeleteOutcome {
  if (result.ok) {
    return {
      rows: removeAdaptation(rows, id),
      removed: true,
      toast: { kind: "success", message: "Adaptación eliminada" },
    };
  }
  return {
    rows,
    removed: false,
    toast: { kind: "error", message: result.error },
  };
}

/**
 * Formats an ISO timestamp as a short localized date-time for the history row.
 * Defensive against an unparseable string (returns it verbatim) so a bad row
 * never throws in render.
 */
export function adaptationTimestamp(
  createdAtIso: string,
  locale = "es-ES",
): string {
  const date = new Date(createdAtIso);
  if (Number.isNaN(date.getTime())) return createdAtIso;
  return date.toLocaleString(locale, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
