// Server Action uploadDocument · F6
// Sube un PDF a Supabase Storage y dispara el job de extracción.

'use server'

import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCurrentWorkspace } from '@/lib/auth/get-current-workspace'
import { db } from '@/db'
import { documents, jobs } from '@/db/schema'
import { inngest } from '@/inngest/client'

const MAX_BYTES = 10 * 1024 * 1024  // 10MB

const uploadSchema = z.object({
  clientId: z.string().uuid(),
  filename: z.string().min(1).max(255),
  mimeType: z.literal('application/pdf'),
  size: z.number().int().positive().max(MAX_BYTES),
})

export async function uploadDocument(formData: FormData) {
  const ws = await getCurrentWorkspace()
  if (!ws?.workspaceId) {
    return { ok: false, error: 'No session' } as const
  }

  const file = formData.get('file')
  const clientId = formData.get('clientId')

  if (!(file instanceof File)) {
    return { ok: false, error: 'No file uploaded' } as const
  }

  const parsed = uploadSchema.safeParse({
    clientId,
    filename: file.name,
    mimeType: file.type,
    size: file.size,
  })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.flatten() } as const
  }

  const supabase = await createSupabaseServerClient()
  const documentId = randomUUID()
  const storagePath = `${ws.workspaceId}/${parsed.data.clientId}/${documentId}.pdf`

  // 1. Upload a Storage. upsert:false porque cada document_id es único.
  const arrayBuffer = await file.arrayBuffer()
  const { error: storageError } = await supabase.storage
    .from('documents')
    .upload(storagePath, arrayBuffer, {
      contentType: 'application/pdf',
      upsert: false,
    })

  if (storageError) {
    return { ok: false, error: 'Upload failed' } as const
  }

  // 2. INSERT documents + INSERT jobs en transacción.
  let jobId: string
  try {
    jobId = await db.transaction(async (tx) => {
      await tx.insert(documents).values({
        id: documentId,
        workspaceId: ws.workspaceId!,
        clientId: parsed.data.clientId,
        storagePath,
        filename: parsed.data.filename,
        sizeBytes: parsed.data.size,
      })

      const [job] = await tx
        .insert(jobs)
        .values({
          workspaceId: ws.workspaceId!,
          type: 'extract_document',
          status: 'pending',
          payload: { documentId, workspaceId: ws.workspaceId },
        })
        .returning({ id: jobs.id })

      return job.id
    })
  } catch (e) {
    // Rollback del Storage si el INSERT falla. Sin esto el bucket
    // acumula archivos huérfanos.
    await supabase.storage.from('documents').remove([storagePath])
    return { ok: false, error: 'DB insert failed' } as const
  }

  // 3. Disparar Inngest event.
  await inngest.send({
    name: 'documents/extract',
    data: { jobId, documentId, workspaceId: ws.workspaceId },
  })

  return { ok: true, jobId, documentId } as const
}

// ============================================================================
// Helper · obtener signed URL para descargar el PDF
// ============================================================================
export async function getDocumentSignedUrl(documentId: string) {
  'use server'
  const ws = await getCurrentWorkspace()
  if (!ws?.workspaceId) {
    return { ok: false, error: 'No session' } as const
  }

  const supabase = await createSupabaseServerClient()

  // Lookup del storage_path (RLS bloquea cross-tenant).
  const docs = await db
    .select({ storagePath: documents.storagePath })
    .from(documents)
    .where(eq(documents.id, documentId))
    .limit(1)

  if (docs.length === 0) {
    return { ok: false, error: 'Not found' } as const
  }

  const { data, error } = await supabase.storage
    .from('documents')
    .createSignedUrl(docs[0].storagePath, 60 * 60)  // 1h TTL

  if (error || !data?.signedUrl) {
    return { ok: false, error: 'Cannot sign URL' } as const
  }

  return { ok: true, url: data.signedUrl } as const
}
