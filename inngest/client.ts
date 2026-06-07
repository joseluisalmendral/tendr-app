import { Inngest } from "inngest";

/**
 * Inngest client seam (F6).
 *
 * Created here in Slice A so the upload Server Action has an `inngest.send`
 * target without depending on the worker (Slice B builds `extract-document.ts`
 * and the `/api/inngest` route on top of this client). Keeping the client in
 * its own module avoids a cycle between the action and the function.
 *
 * `eventKey` comes from INNGEST_EVENT_KEY; in local dev the Inngest dev server
 * accepts events without it, so it is optional at construction time. The event
 * payload shape for the extraction pipeline is `DocumentsExtractEventData`;
 * the upload seam's `InngestSender` interface enforces it at the call site.
 */

/**
 * `documents/extract` payload. `id` is set to the job id on send so Inngest
 * deduplicates retries of the same job (idempotency key).
 */
export type DocumentsExtractEventData = {
  jobId: string;
  documentId: string;
  workspaceId: string;
};

export const inngest = new Inngest({
  id: "tendr-app",
  eventKey: process.env.INNGEST_EVENT_KEY,
});
