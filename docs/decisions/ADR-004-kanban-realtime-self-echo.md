# ADR-004 · Kanban Realtime: self-echo, RPC atómico y filtro de tenant

> Decisión arquitectónica versionada. Cambios mayores requieren nuevo ADR que supersede a este.

---

## Estado

Aceptada

## Fecha

2026-06-07

## Contexto

F5 (slice D) agrega el tablero Kanban: 5 columnas (`prospect`, `proposal`, `active`, `closed_won`, `closed_lost`), arrastre de casos entre estados, y sincronización en tiempo real. Tendr es 1:1 owner→workspace: NO hay miembros múltiples por workspace, así que el único escenario multi-sesión real es el MISMO usuario en dos pestañas/dispositivos. Tres decisiones cruzadas necesitaban quedar fijadas:

1. **Self-echo**: si la pestaña que mueve un caso emite un `UPDATE` por Realtime, ¿cómo evitar que ese eco vuelva a aplicarse sobre su propio estado optimista (doble aplicación / parpadeo)?
2. **Atomicidad del move**: el cambio de estado del caso y su registro en `audit_log` deben pasar juntos, bajo la identidad del usuario, sin `service_role`.
3. **Aislamiento de tenant en la suscripción Realtime**: cómo garantizar que una pestaña jamás reciba cambios de otro workspace.

## Decisión

### D1 · Self-echo = reconciliación idempotente payload-vs-local

Cada evento `postgres_changes` se trata como autoritativo y se aplica SOLO si `payload.new.status !== estadoMostradoActual[caseId]`. Es convergente: la pestaña que originó el move ya tiene su estado local igual al del servidor cuando llega el eco → no-op natural; una SEGUNDA pestaña del mismo usuario sí ve una diferencia → refresca. Cero estado extra, cero columna de esquema, sin parpadeo. `moveCase` sigue escribiendo `updated_by = auth.uid()` para auditoría/procedencia, pero NO se usa como filtro de eco.

### D2 · RPC atómico `move_case` SECURITY DEFINER (UPDATE + audit en una transacción)

`public.move_case(p_case_id, p_to_status)` (migración 0003) valida la pertenencia (`auth.uid()` + workspace dueño del caso) UNA vez, luego hace el `UPDATE` de estado/`updated_by`/`updated_at` y el `INSERT` en `audit_log` en la MISMA transacción. Mismo patrón sancionado que `log_promotion` (bypass de RLS disclosed con gate interno por `auth.uid()`), corre bajo la identidad del usuario, NO `service_role`. `REVOKE` de public/anon/service_role, `GRANT` solo a `authenticated`. La Server Action `moveCase` solo invoca el RPC vía el cliente server (JWT del usuario).

### D3 · Suscripción Realtime con filtro de tenant obligatorio

UNA suscripción global por montaje del tablero, vía hook reutilizable `lib/realtime/use-workspace-realtime.ts`: canal `workspace:${workspaceId}`, `postgres_changes` sobre `cases` con filtro **`workspace_id=eq.${workspaceId}` OBLIGATORIO**. Omitir el filtro sería una fuga cross-tenant (parada dura). `cases` ya está en la publicación `supabase_realtime` con `REPLICA IDENTITY FULL` (migración 0001 §17), así que 0003 no toca la publicación. El cliente browser (`@supabase/ssr`) lleva la sesión por cookie, de modo que los `postgres_changes` quedan además filtrados por RLS — cinturón y tiradores.

**Motion**: solo CSS + transform nativo de dnd-kit (sin librería de animación; `framer-motion` no es dependencia). Lift en `isDragging` (scale 1.02 + sombra, 150ms `cubic-bezier(.23,1,.32,1)`), settle amortiguado por el `transition` de dnd-kit, `:active` scale 0.98, y `prefers-reduced-motion` desactiva escalas/sombras.

## Alternativas consideradas

| Opción | Tradeoff principal |
|---|---|
| Self-echo por `updated_by === currentUserId` (ignorar lo propio) | Descartada: en un workspace 1:1, `updated_by` SIEMPRE es el usuario actual, así que AMBAS pestañas ignorarían TODOS los eventos → Realtime nunca dispararía para el único escenario que existe (mismo usuario, dos pestañas). Correcto solo en workspaces multi-usuario, que F5 no es. |
| Self-echo por mutation-id / pending-set (caseId+status) | Descartada como principal: requiere rastrear un set de pendientes y reconciliar al settle; propenso a carreras si dos moves del mismo caso se solapan, y suma columna de esquema o bookkeeping frágil para un problema que (c) resuelve sin estado. Queda como fallback documentado si se observara parpadeo. |
| RLS UPDATE + RPC `log_case_move` separado | Descartada: no atómico; si el segundo llamado falla queda media-operación (estado movido sin audit, o viceversa) y `moveCase` necesitaría lógica compensatoria. |
| Reconciliación idempotente + RPC atómico único + filtro obligatorio (elegida) | Gana por convergencia sin estado, atomicidad real, y aislamiento de tenant con doble garantía (filtro explícito + RLS Realtime). |

## Notas de implementación

- **Realtime requiere `setAuth` para `postgres_changes`**: en el stack local, un cliente recién autenticado NO entrega eventos `postgres_changes` hasta empujar el JWT al socket con `client.realtime.setAuth(access_token)` (el chequeo walrus de RLS sobre `cases` falla sin él). El cliente browser de `@supabase/ssr` hace el equivalente automáticamente vía la cookie de sesión; el test de Realtime lo hace explícito. Descubierto al hacer fallar y arreglar el test contra el stack real.
- **Tests** (`app/(app)/kanban/__tests__/realtime-sync.test.ts`) contra el stack local real: modelan el segundo-tab del MISMO usuario (dos sesiones A independientes), afirman que el callback recibe `new.status` y que el filtro es exactamente `workspace_id=eq.${workspaceId}`; un cambio de OTRO tenant nunca llega al canal filtrado. Limpieza de `audit_log` por `actor_id` vía psql ANTES de `teardownTenants` (FK `ON DELETE NO ACTION`).
- **Pendiente remoto**: la migración 0003 debe aplicarse al proyecto Supabase dev remoto antes de publicar el Kanban (hasta ahora solo local).
