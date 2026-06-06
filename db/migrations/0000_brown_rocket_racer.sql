CREATE TYPE "public"."ai_feature" AS ENUM('adapt_template', 'summarize', 'suggest', 'extract_document');--> statement-breakpoint
CREATE TYPE "public"."ai_provider" AS ENUM('openai', 'anthropic', 'google', 'deepseek', 'moonshot');--> statement-breakpoint
CREATE TYPE "public"."case_status" AS ENUM('prospect', 'proposal', 'active', 'closed_won', 'closed_lost');--> statement-breakpoint
CREATE TYPE "public"."client_status" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('pending', 'running', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."manifest_status" AS ENUM('pending', 'active', 'deprecated');--> statement-breakpoint
CREATE TYPE "public"."plan" AS ENUM('free', 'pro', 'team');--> statement-breakpoint
CREATE TABLE "ai_feature_model_mapping" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"feature" "ai_feature" NOT NULL,
	"provider" "ai_provider" NOT NULL,
	"model_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_feature_model_mapping_workspace_feature_unique" UNIQUE("workspace_id","feature")
);
--> statement-breakpoint
CREATE TABLE "ai_model_manifest" (
	"provider" "ai_provider" NOT NULL,
	"model_id" text NOT NULL,
	"display_name" text NOT NULL,
	"status" "manifest_status" DEFAULT 'pending' NOT NULL,
	"default_for_features" text[] DEFAULT '{}' NOT NULL,
	"supports_multimodal" boolean DEFAULT false,
	"supports_pdf" boolean DEFAULT false,
	"supports_image" boolean DEFAULT false,
	"supports_streaming" boolean DEFAULT true,
	"max_input_tokens" integer NOT NULL,
	"cost_per_1k_input" numeric(10, 6) NOT NULL,
	"cost_per_1k_output" numeric(10, 6) NOT NULL,
	"deprecated_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_model_manifest_provider_model_id_pk" PRIMARY KEY("provider","model_id")
);
--> statement-breakpoint
CREATE TABLE "ai_provider_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"provider" "ai_provider" NOT NULL,
	"encrypted_key" text NOT NULL,
	"key_iv" text NOT NULL,
	"key_tag" text NOT NULL,
	"encrypted_dek" text NOT NULL,
	"key_validated_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_provider_configs_workspace_provider_unique" UNIQUE("workspace_id","provider")
);
--> statement-breakpoint
CREATE TABLE "ai_usage_ledger" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"feature" text NOT NULL,
	"provider" text NOT NULL,
	"model_id" text NOT NULL,
	"tokens_in" integer NOT NULL,
	"tokens_out" integer NOT NULL,
	"cost_cents" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"workspace_id" uuid,
	"actor_id" uuid,
	"action" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" uuid,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stripe_webhook_events" (
	"event_id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"stripe_customer_id" text NOT NULL,
	"stripe_subscription_id" text,
	"plan" "plan" DEFAULT 'free' NOT NULL,
	"status" text NOT NULL,
	"current_period_end" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_workspace_id_unique" UNIQUE("workspace_id")
);
--> statement-breakpoint
CREATE TABLE "cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"title" text NOT NULL,
	"status" "case_status" DEFAULT 'prospect',
	"value_cents" integer,
	"next_action_at" timestamp with time zone,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"company" text,
	"tags" text[] DEFAULT '{}',
	"status" "client_status" DEFAULT 'active',
	"notes_summary" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_id" uuid,
	"case_id" uuid,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notes_client_or_case_check" CHECK ("notes"."client_id" is not null or "notes"."case_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"storage_path" text NOT NULL,
	"filename" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"extracted_metadata" jsonb,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"plan" "plan" DEFAULT 'free' NOT NULL,
	"ai_monthly_budget_cents" integer DEFAULT 5000,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspaces_owner_id_unique" UNIQUE("owner_id")
);
--> statement-breakpoint
CREATE TABLE "templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"body_markdown" text NOT NULL,
	"variables" text[] DEFAULT '{}',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"type" text NOT NULL,
	"status" "job_status" DEFAULT 'pending' NOT NULL,
	"progress" jsonb DEFAULT '[]'::jsonb,
	"payload" jsonb,
	"result" jsonb,
	"error" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_feature_model_mapping" ADD CONSTRAINT "ai_feature_model_mapping_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_feature_model_mapping" ADD CONSTRAINT "ai_feature_model_mapping_manifest_fk" FOREIGN KEY ("provider","model_id") REFERENCES "public"."ai_model_manifest"("provider","model_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_provider_configs" ADD CONSTRAINT "ai_provider_configs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage_ledger" ADD CONSTRAINT "ai_usage_ledger_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "templates" ADD CONSTRAINT "templates_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_feature_model_mapping_workspace_id_idx" ON "ai_feature_model_mapping" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "ai_provider_configs_workspace_id_idx" ON "ai_provider_configs" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "ai_usage_ledger_workspace_month_idx" ON "ai_usage_ledger" USING btree ("workspace_id",date_trunc('month', "created_at" at time zone 'UTC'));--> statement-breakpoint
CREATE INDEX "audit_log_workspace_id_idx" ON "audit_log" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "audit_log_actor_id_idx" ON "audit_log" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "subscriptions_workspace_id_idx" ON "subscriptions" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "cases_workspace_id_idx" ON "cases" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "cases_client_id_idx" ON "cases" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "cases_workspace_status_idx" ON "cases" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "clients_workspace_id_idx" ON "clients" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "notes_workspace_id_idx" ON "notes" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "notes_client_id_idx" ON "notes" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "notes_case_id_idx" ON "notes" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "documents_workspace_id_idx" ON "documents" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "documents_client_id_idx" ON "documents" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "templates_workspace_id_idx" ON "templates" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "jobs_workspace_id_idx" ON "jobs" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "jobs_workspace_status_idx" ON "jobs" USING btree ("workspace_id","status");