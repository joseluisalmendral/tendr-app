import { PDFParse } from "pdf-parse";

/**
 * Thin wrapper over the pdf-parse v2 class API.
 *
 * v2 replaced the v1 callable default export with a `PDFParse` class: you
 * construct it with the binary `data`, call `getText()`, and MUST `destroy()`
 * to release the underlying pdfjs worker/document — otherwise handles leak in
 * a long-lived process. `destroy()` runs in `finally` so it executes even when
 * parsing throws (e.g. an encrypted or corrupt PDF), which the worker maps to a
 * `document_error` failure.
 *
 * This is only the fallback path: it runs when the routed model's manifest has
 * `supports_pdf = false`. PDF-capable models receive the raw bytes as a native
 * file part instead. The extracted text is sent to the model but NEVER written
 * to a Langfuse trace or log.
 */
export async function extractTextFromPdf(
  data: ArrayBuffer | Uint8Array,
): Promise<string> {
  const parser = new PDFParse({ data });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}
