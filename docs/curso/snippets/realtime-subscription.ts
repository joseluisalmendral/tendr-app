// Hook Realtime de Tendr · F5
// Suscripción filtrada por workspace_id. SIN filter hay leak entre tenants.

'use client'

import { useEffect } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'

type RealtimePayload = {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE'
  schema: 'public'
  table: 'cases' | 'clients' | 'notes' | 'documents' | 'jobs'
  new: Record<string, unknown>
  old: Record<string, unknown>
}

/**
 * Suscribe a cambios en las tablas del workspace actual.
 *
 * OBLIGATORIO: el filtro `workspace_id=eq.${workspaceId}` previene leak
 * entre tenants. Sin él, la suscripción recibe cambios de TODOS los
 * workspaces.
 */
export function useRealtimeWorkspace(
  workspaceId: string,
  onChange: (payload: RealtimePayload) => void,
) {
  useEffect(() => {
    if (!workspaceId) return

    const supabase = createSupabaseBrowserClient()
    const channel = supabase
      .channel(`workspace:${workspaceId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'cases',
          filter: `workspace_id=eq.${workspaceId}`,
        },
        (payload) => onChange(payload as unknown as RealtimePayload),
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'jobs',
          filter: `workspace_id=eq.${workspaceId}`,
        },
        (payload) => onChange(payload as unknown as RealtimePayload),
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [workspaceId, onChange])
}

// ============================================================================
// Patrón "ignore self echo"
// ============================================================================
// Cuando una tab origina un UPDATE, recibe también el evento Realtime de su
// propio cambio. Si aplicas el cambio de nuevo, puede sobrescribir el
// optimistic con un valor obsoleto.
//
// Estrategia recomendada:
// 1. En cada UPDATE, incluir `updated_by = auth.uid()` en el payload.
// 2. En el callback Realtime, filtrar:
//    if (payload.new.updated_by === currentUserId) return
// 3. Alternativa: usar un session_id del tab (uuid generado al cargar) y
//    filtrar por session_id en lugar de user_id. Más robusto si el user
//    tiene varias tabs abiertas y quiere ver cambios de sus otras tabs.
