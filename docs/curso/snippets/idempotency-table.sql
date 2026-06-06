-- Tabla de idempotencia para webhooks de Stripe · F8
-- Ya está en el schema de F3, aquí se documenta el patrón completo.

create table if not exists stripe_webhook_events (
  event_id text primary key,           -- evt_xxxxxxxx de Stripe; garantía única
  type text not null,                  -- ej: 'checkout.session.completed'
  processed_at timestamptz default now()
);

-- ============================================================================
-- Por qué la PK es event_id (text de Stripe) y no un uuid local
-- ============================================================================
-- Stripe garantiza que event_id es único por cuenta y nunca se reusa.
-- Usarlo como PK convierte la idempotencia en un check del motor de
-- Postgres: si intentas insertar un event_id ya presente, INSERT lanza
-- unique violation y la transacción hace ROLLBACK.
--
-- Esto significa que la idempotencia ES la PK, no un código de aplicación
-- que pregunta antes de insertar. Es más rápido y más fiable.

-- ============================================================================
-- Patrón de uso (referencia)
-- ============================================================================
-- En el handler del webhook:
--
-- BEGIN;
--   INSERT INTO stripe_webhook_events (event_id, type)
--   VALUES ('evt_xxx', 'checkout.session.completed');
--   -- Si falla (PK violation): ROLLBACK automático.
--
--   UPDATE subscriptions
--   SET plan = 'pro', status = 'active', ...
--   WHERE workspace_id = '...';
-- COMMIT;
--
-- Resultado:
-- - Primera vez que llega evt_xxx: INSERT + UPDATE OK → 200 'OK'.
-- - Segunda vez que llega evt_xxx (retry de Stripe): INSERT falla →
--   ROLLBACK → handler devuelve 200 'Already processed'. No duplica.

-- ============================================================================
-- RLS sobre stripe_webhook_events
-- ============================================================================
-- La tabla NO necesita RLS para el cliente (los users normales no leen
-- esta tabla). El webhook handler usa service_role para INSERT.
-- Si quieres exponer una vista de eventos al admin del workspace, crea
-- una vista filtrada por workspace_id mediante JOIN con subscriptions.

-- ============================================================================
-- Limpieza periódica
-- ============================================================================
-- Esta tabla crece con cada webhook. Para mantener tamaño razonable:
--
--   DELETE FROM stripe_webhook_events
--   WHERE processed_at < now() - interval '90 days';
--
-- 90 días es más que suficiente: Stripe deja de reintentar webhooks tras
-- ~3 días. Cualquier evento más viejo no necesita el check de idempotencia.
-- Configurar como cron job en Vercel o como Supabase scheduled function.
