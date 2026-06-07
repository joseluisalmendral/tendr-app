import { describe, expect, it } from "vitest";

import { extractTextFromPdf } from "@/lib/ai/pdf-parse";

/**
 * pdf-parse v2 wrapper: a tiny hand-built single-page PDF with the literal text
 * "Tendr F6 extraction" is parsed and the extracted text is returned. This
 * exercises the real class API (`new PDFParse({ data }); getText(); destroy()`)
 * end to end — no provider, no DB.
 */

/**
 * Minimal but VALID single-page PDF showing "Tendr F6 extraction".
 *
 * Built by hand: a 5-object PDF (catalog, pages, page, font, content stream)
 * with a literal xref-less structure pdf.js tolerates. Kept inline so the test
 * has no binary fixture to track.
 */
function tinyPdf(): Uint8Array {
  const pdf = [
    "%PDF-1.4",
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
    "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj",
    "4 0 obj << /Length 64 >>",
    "stream",
    "BT /F1 18 Tf 20 100 Td (Tendr F6 extraction) Tj ET",
    "endstream",
    "endobj",
    "5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj",
    "trailer << /Root 1 0 R /Size 6 >>",
    "%%EOF",
    "",
  ].join("\n");
  return new TextEncoder().encode(pdf);
}

describe("extractTextFromPdf", () => {
  it("extracts text from a valid PDF", async () => {
    const text = await extractTextFromPdf(tinyPdf());
    expect(text).toContain("Tendr F6 extraction");
  });
});
