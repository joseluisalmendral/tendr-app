-- Schema SQL de referencia para Tendr SaaS · F3
-- Importado del plan §11.3 + produccion-y-seguridad.md §3.1
-- El alumno NO ejecuta este SQL directamente; Drizzle genera la migración
-- desde db/schema/*.ts. Este archivo sirve como referencia visual del modelo.

-- ============================================================================
-- Workspaces (anchor de aislamiento multi-tenant)
-- ============================================================================
create table workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) not null,
  name text not null,
  -- Cache denormalizado del plan. La fuente de verdad para el gating es la
  -- tabla subscriptions (sin fila activa = Free); esta columna NO se usa para
  -- decidir acceso a features. El webhook de pagos no la sincroniza.
  plan text not null default 'free' check (plan in ('free','pro','team')),
  ai_monthly_budget_cents integer default 5000,  -- 50 EUR mensuales por defecto
  created_at timestamptz default now()
);

-- ============================================================================
-- Core CRM
-- ============================================================================
create table clients (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces(id) on delete cascade not null,
  name text not null,
  email text,
  phone text,
  company text,
  tags text[] default '{}',
  status text default 'active' check (status in ('active','archived')),
  -- notes_summary: lo escribe la Server Action summarize(clientId) en F7 y lo
  -- lee adaptTemplate en F7 para personalizar plantillas. Nullable: empieza
  -- vacío hasta el primer resumen.
  notes_summary text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table cases (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces(id) on delete cascade not null,
  client_id uuid references clients(id) on delete cascade not null,
  title text not null,
  status text default 'prospect' check (status in ('prospect','proposal','active','closed_won','closed_lost')),
  value_cents integer,
  next_action_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table notes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces(id) on delete cascade not null,
  client_id uuid references clients(id) on delete cascade,
  case_id uuid references cases(id) on delete cascade,
  body text not null,
  created_at timestamptz default now()
);

-- ============================================================================
-- Documentos (Storage + extractor IA en F6)
-- ============================================================================
create table documents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces(id) on delete cascade not null,
  client_id uuid references clients(id) on delete cascade not null,
  storage_path text not null,
  filename text not null,
  size_bytes integer not null,
  extracted_metadata jsonb,
  expires_at timestamptz,
  created_at timestamptz default now()
);

-- ============================================================================
-- Templates (con adapter IA en F7)
-- ============================================================================
create table templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces(id) on delete cascade not null,
  name text not null,
  body_markdown text not null,
  variables text[] default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================================================
-- Jobs (patrón del referente · F6 y F7)
-- ============================================================================
create table jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces(id) on delete cascade not null,
  type text not null,
  status text not null default 'pending' check (status in ('pending','running','completed','failed','cancelled')),
  progress jsonb default '[]'::jsonb,
  payload jsonb,
  result jsonb,
  error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz default now()
);

-- ============================================================================
-- Stripe (F8)
-- ============================================================================
create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces(id) on delete cascade not null unique,
  stripe_customer_id text not null,
  stripe_subscription_id text,
  plan text not null default 'free',
  status text not null,
  current_period_end timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table stripe_webhook_events (
  event_id text primary key,
  type text not null,
  processed_at timestamptz default now()
);

-- ============================================================================
-- Audit log
-- ============================================================================
create table audit_log (
  id bigserial primary key,
  workspace_id uuid references workspaces(id) on delete cascade,
  actor_id uuid references auth.users(id),
  action text not null,
  resource_type text not null,
  resource_id uuid,
  metadata jsonb,
  created_at timestamptz default now()
);

-- ============================================================================
-- TABLAS IA · F6 + F7 (BYO key + multi-provider)
-- ============================================================================

-- API keys cifradas por workspace y provider (envelope encryption AES-256-GCM)
create table ai_provider_configs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces(id) on delete cascade not null,
  provider text not null check (provider in ('openai','anthropic','google','deepseek','moonshot')),
  encrypted_key text not null,
  key_iv text not null,
  key_tag text not null,
  encrypted_dek text not null,
  key_validated_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz default now(),
  unique (workspace_id, provider)
);

-- Qué modelo usa cada feature en cada workspace
create table ai_feature_model_mapping (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces(id) on delete cascade not null,
  feature text not null check (feature in ('adapt_template','summarize','suggest','extract_document')),
  provider text not null,
  model_id text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (workspace_id, feature)
);

-- Manifest curado de modelos disponibles + capabilities (lectura pública)
create table ai_model_manifest (
  provider text not null,
  model_id text not null,
  display_name text not null,
  supports_multimodal boolean default false,
  supports_pdf boolean default false,
  supports_image boolean default false,
  supports_streaming boolean default true,
  max_input_tokens integer not null,
  cost_per_1k_input numeric(10,6) not null,
  cost_per_1k_output numeric(10,6) not null,
  deprecated_at timestamptz,
  updated_at timestamptz default now(),
  primary key (provider, model_id)
);

-- Tracking de coste por workspace y feature (cost budget en F7)
create table ai_usage_ledger (
  id bigserial primary key,
  workspace_id uuid references workspaces(id) on delete cascade not null,
  feature text not null,
  provider text not null,
  model_id text not null,
  tokens_in integer not null,
  tokens_out integer not null,
  cost_cents integer not null,
  created_at timestamptz default now()
);

create index ai_usage_ledger_workspace_month_idx
  on ai_usage_ledger (workspace_id, date_trunc('month', created_at));
