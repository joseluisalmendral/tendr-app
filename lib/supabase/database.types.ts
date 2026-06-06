// Generated from the remote Supabase project schema via MCP
// (generate_typescript_types). Regenerate after applying migrations:
// the schema source of truth is db/schema/ (Drizzle).

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      ai_feature_model_mapping: {
        Row: {
          created_at: string
          feature: Database["public"]["Enums"]["ai_feature"]
          id: string
          model_id: string
          provider: Database["public"]["Enums"]["ai_provider"]
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          feature: Database["public"]["Enums"]["ai_feature"]
          id?: string
          model_id: string
          provider: Database["public"]["Enums"]["ai_provider"]
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          feature?: Database["public"]["Enums"]["ai_feature"]
          id?: string
          model_id?: string
          provider?: Database["public"]["Enums"]["ai_provider"]
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_feature_model_mapping_manifest_fk"
            columns: ["provider", "model_id"]
            isOneToOne: false
            referencedRelation: "ai_model_manifest"
            referencedColumns: ["provider", "model_id"]
          },
          {
            foreignKeyName: "ai_feature_model_mapping_workspace_id_workspaces_id_fk"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_model_manifest: {
        Row: {
          cost_per_1k_input: number
          cost_per_1k_output: number
          default_for_features: string[]
          deprecated_at: string | null
          display_name: string
          max_input_tokens: number
          model_id: string
          provider: Database["public"]["Enums"]["ai_provider"]
          status: Database["public"]["Enums"]["manifest_status"]
          supports_image: boolean | null
          supports_multimodal: boolean | null
          supports_pdf: boolean | null
          supports_streaming: boolean | null
          updated_at: string
        }
        Insert: {
          cost_per_1k_input: number
          cost_per_1k_output: number
          default_for_features?: string[]
          deprecated_at?: string | null
          display_name: string
          max_input_tokens: number
          model_id: string
          provider: Database["public"]["Enums"]["ai_provider"]
          status?: Database["public"]["Enums"]["manifest_status"]
          supports_image?: boolean | null
          supports_multimodal?: boolean | null
          supports_pdf?: boolean | null
          supports_streaming?: boolean | null
          updated_at?: string
        }
        Update: {
          cost_per_1k_input?: number
          cost_per_1k_output?: number
          default_for_features?: string[]
          deprecated_at?: string | null
          display_name?: string
          max_input_tokens?: number
          model_id?: string
          provider?: Database["public"]["Enums"]["ai_provider"]
          status?: Database["public"]["Enums"]["manifest_status"]
          supports_image?: boolean | null
          supports_multimodal?: boolean | null
          supports_pdf?: boolean | null
          supports_streaming?: boolean | null
          updated_at?: string
        }
        Relationships: []
      }
      ai_provider_configs: {
        Row: {
          created_at: string
          encrypted_dek: string
          encrypted_key: string
          id: string
          key_iv: string
          key_tag: string
          key_validated_at: string | null
          last_used_at: string | null
          provider: Database["public"]["Enums"]["ai_provider"]
          workspace_id: string
        }
        Insert: {
          created_at?: string
          encrypted_dek: string
          encrypted_key: string
          id?: string
          key_iv: string
          key_tag: string
          key_validated_at?: string | null
          last_used_at?: string | null
          provider: Database["public"]["Enums"]["ai_provider"]
          workspace_id: string
        }
        Update: {
          created_at?: string
          encrypted_dek?: string
          encrypted_key?: string
          id?: string
          key_iv?: string
          key_tag?: string
          key_validated_at?: string | null
          last_used_at?: string | null
          provider?: Database["public"]["Enums"]["ai_provider"]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_provider_configs_workspace_id_workspaces_id_fk"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_usage_ledger: {
        Row: {
          cost_cents: number
          created_at: string
          feature: string
          id: number
          model_id: string
          provider: string
          tokens_in: number
          tokens_out: number
          workspace_id: string
        }
        Insert: {
          cost_cents: number
          created_at?: string
          feature: string
          id?: number
          model_id: string
          provider: string
          tokens_in: number
          tokens_out: number
          workspace_id: string
        }
        Update: {
          cost_cents?: number
          created_at?: string
          feature?: string
          id?: number
          model_id?: string
          provider?: string
          tokens_in?: number
          tokens_out?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_ledger_workspace_id_workspaces_id_fk"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          id: number
          metadata: Json | null
          resource_id: string | null
          resource_type: string
          workspace_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          id?: number
          metadata?: Json | null
          resource_id?: string | null
          resource_type: string
          workspace_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          id?: number
          metadata?: Json | null
          resource_id?: string | null
          resource_type?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_workspace_id_workspaces_id_fk"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      cases: {
        Row: {
          client_id: string
          created_at: string
          id: string
          next_action_at: string | null
          status: Database["public"]["Enums"]["case_status"] | null
          title: string
          updated_at: string
          updated_by: string | null
          value_cents: number | null
          workspace_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          next_action_at?: string | null
          status?: Database["public"]["Enums"]["case_status"] | null
          title: string
          updated_at?: string
          updated_by?: string | null
          value_cents?: number | null
          workspace_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          next_action_at?: string | null
          status?: Database["public"]["Enums"]["case_status"] | null
          title?: string
          updated_at?: string
          updated_by?: string | null
          value_cents?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cases_client_id_clients_id_fk"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_workspace_id_workspaces_id_fk"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          company: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          notes_summary: string | null
          phone: string | null
          status: Database["public"]["Enums"]["client_status"] | null
          tags: string[] | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          company?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes_summary?: string | null
          phone?: string | null
          status?: Database["public"]["Enums"]["client_status"] | null
          tags?: string[] | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          company?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes_summary?: string | null
          phone?: string | null
          status?: Database["public"]["Enums"]["client_status"] | null
          tags?: string[] | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_workspace_id_workspaces_id_fk"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          client_id: string
          created_at: string
          expires_at: string | null
          extracted_metadata: Json | null
          filename: string
          id: string
          size_bytes: number
          storage_path: string
          workspace_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          expires_at?: string | null
          extracted_metadata?: Json | null
          filename: string
          id?: string
          size_bytes: number
          storage_path: string
          workspace_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          expires_at?: string | null
          extracted_metadata?: Json | null
          filename?: string
          id?: string
          size_bytes?: number
          storage_path?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_client_id_clients_id_fk"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_workspace_id_workspaces_id_fk"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          completed_at: string | null
          created_at: string
          error: string | null
          id: string
          payload: Json | null
          progress: Json | null
          result: Json | null
          started_at: string | null
          status: Database["public"]["Enums"]["job_status"]
          type: string
          workspace_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error?: string | null
          id?: string
          payload?: Json | null
          progress?: Json | null
          result?: Json | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          type: string
          workspace_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error?: string | null
          id?: string
          payload?: Json | null
          progress?: Json | null
          result?: Json | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          type?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "jobs_workspace_id_workspaces_id_fk"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      notes: {
        Row: {
          body: string
          case_id: string | null
          client_id: string | null
          created_at: string
          id: string
          workspace_id: string
        }
        Insert: {
          body: string
          case_id?: string | null
          client_id?: string | null
          created_at?: string
          id?: string
          workspace_id: string
        }
        Update: {
          body?: string
          case_id?: string | null
          client_id?: string | null
          created_at?: string
          id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notes_case_id_cases_id_fk"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_client_id_clients_id_fk"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_workspace_id_workspaces_id_fk"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      stripe_webhook_events: {
        Row: {
          event_id: string
          processed_at: string
          type: string
        }
        Insert: {
          event_id: string
          processed_at?: string
          type: string
        }
        Update: {
          event_id?: string
          processed_at?: string
          type?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          created_at: string
          current_period_end: string | null
          id: string
          plan: Database["public"]["Enums"]["plan"]
          status: string
          stripe_customer_id: string
          stripe_subscription_id: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          current_period_end?: string | null
          id?: string
          plan?: Database["public"]["Enums"]["plan"]
          status: string
          stripe_customer_id: string
          stripe_subscription_id?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          current_period_end?: string | null
          id?: string
          plan?: Database["public"]["Enums"]["plan"]
          status?: string
          stripe_customer_id?: string
          stripe_subscription_id?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_workspace_id_workspaces_id_fk"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      templates: {
        Row: {
          body_markdown: string
          created_at: string
          id: string
          name: string
          updated_at: string
          variables: string[] | null
          workspace_id: string
        }
        Insert: {
          body_markdown: string
          created_at?: string
          id?: string
          name: string
          updated_at?: string
          variables?: string[] | null
          workspace_id: string
        }
        Update: {
          body_markdown?: string
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
          variables?: string[] | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "templates_workspace_id_workspaces_id_fk"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          ai_monthly_budget_cents: number | null
          created_at: string
          id: string
          name: string
          owner_id: string
          plan: Database["public"]["Enums"]["plan"]
        }
        Insert: {
          ai_monthly_budget_cents?: number | null
          created_at?: string
          id?: string
          name: string
          owner_id: string
          plan?: Database["public"]["Enums"]["plan"]
        }
        Update: {
          ai_monthly_budget_cents?: number | null
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          plan?: Database["public"]["Enums"]["plan"]
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      ai_feature:
        | "adapt_template"
        | "summarize"
        | "suggest"
        | "extract_document"
      ai_provider: "openai" | "anthropic" | "google" | "deepseek" | "moonshot"
      case_status:
        | "prospect"
        | "proposal"
        | "active"
        | "closed_won"
        | "closed_lost"
      client_status: "active" | "archived"
      job_status: "pending" | "running" | "completed" | "failed" | "cancelled"
      manifest_status: "pending" | "active" | "deprecated"
      plan: "free" | "pro" | "team"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      ai_feature: [
        "adapt_template",
        "summarize",
        "suggest",
        "extract_document",
      ],
      ai_provider: ["openai", "anthropic", "google", "deepseek", "moonshot"],
      case_status: [
        "prospect",
        "proposal",
        "active",
        "closed_won",
        "closed_lost",
      ],
      client_status: ["active", "archived"],
      job_status: ["pending", "running", "completed", "failed", "cancelled"],
      manifest_status: ["pending", "active", "deprecated"],
      plan: ["free", "pro", "team"],
    },
  },
} as const
