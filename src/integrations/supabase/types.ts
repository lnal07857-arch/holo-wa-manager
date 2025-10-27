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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      account_warmup_stats: {
        Row: {
          account_id: string
          blocks: number | null
          created_at: string | null
          id: string
          phase: string | null
          received_messages: number | null
          sent_messages: number | null
          status: string | null
          unique_contacts: Json | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          account_id: string
          blocks?: number | null
          created_at?: string | null
          id?: string
          phase?: string | null
          received_messages?: number | null
          sent_messages?: number | null
          status?: string | null
          unique_contacts?: Json | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          account_id?: string
          blocks?: number | null
          created_at?: string | null
          id?: string
          phase?: string | null
          received_messages?: number | null
          sent_messages?: number | null
          status?: string | null
          unique_contacts?: Json | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_warmup_stats_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "whatsapp_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      bulk_campaigns: {
        Row: {
          account_id: string
          campaign_name: string
          created_at: string
          failed_count: number
          id: string
          sent_count: number
          settings: Json | null
          status: string
          template_id: string
          total_recipients: number
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id: string
          campaign_name: string
          created_at?: string
          failed_count?: number
          id?: string
          sent_count?: number
          settings?: Json | null
          status?: string
          template_id: string
          total_recipients?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string
          campaign_name?: string
          created_at?: string
          failed_count?: number
          id?: string
          sent_count?: number
          settings?: Json | null
          status?: string
          template_id?: string
          total_recipients?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bulk_campaigns_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bulk_campaigns_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "message_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_recipients: {
        Row: {
          campaign_id: string
          contact_id: string
          created_at: string
          error_message: string | null
          id: string
          sent_at: string | null
          status: string
        }
        Insert: {
          campaign_id: string
          contact_id: string
          created_at?: string
          error_message?: string | null
          id?: string
          sent_at?: string | null
          status?: string
        }
        Update: {
          campaign_id?: string
          contact_id?: string
          created_at?: string
          error_message?: string | null
          id?: string
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_recipients_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "bulk_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_recipients_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          created_at: string
          custom_fields: Json | null
          id: string
          name: string
          phone_number: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          custom_fields?: Json | null
          id?: string
          name: string
          phone_number: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          custom_fields?: Json | null
          id?: string
          name?: string
          phone_number?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      follow_up_disabled_contacts: {
        Row: {
          contact_phone: string
          created_at: string
          disabled_at: string
          id: string
          user_id: string
        }
        Insert: {
          contact_phone: string
          created_at?: string
          disabled_at?: string
          id?: string
          user_id: string
        }
        Update: {
          contact_phone?: string
          created_at?: string
          disabled_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      message_templates: {
        Row: {
          category: string
          created_at: string
          display_order: number | null
          for_chats: boolean | null
          id: string
          placeholders: string[] | null
          template_name: string
          template_text: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category: string
          created_at?: string
          display_order?: number | null
          for_chats?: boolean | null
          id?: string
          placeholders?: string[] | null
          template_name: string
          template_text: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string
          display_order?: number | null
          for_chats?: boolean | null
          id?: string
          placeholders?: string[] | null
          template_name?: string
          template_text?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          account_id: string
          contact_name: string | null
          contact_phone: string
          created_at: string
          direction: string
          id: string
          is_read: boolean
          is_warmup: boolean
          media_mimetype: string | null
          media_type: string | null
          media_url: string | null
          message_text: string
          sent_at: string
        }
        Insert: {
          account_id: string
          contact_name?: string | null
          contact_phone: string
          created_at?: string
          direction: string
          id?: string
          is_read?: boolean
          is_warmup?: boolean
          media_mimetype?: string | null
          media_type?: string | null
          media_url?: string | null
          message_text: string
          sent_at?: string
        }
        Update: {
          account_id?: string
          contact_name?: string | null
          contact_phone?: string
          created_at?: string
          direction?: string
          id?: string
          is_read?: boolean
          is_warmup?: boolean
          media_mimetype?: string | null
          media_type?: string | null
          media_url?: string | null
          message_text?: string
          sent_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          full_name: string | null
          global_profile_address: string | null
          global_profile_category: string | null
          global_profile_description: string | null
          global_profile_email: string | null
          global_profile_image: string | null
          global_profile_info: string | null
          global_profile_name: string | null
          global_profile_website: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name?: string | null
          global_profile_address?: string | null
          global_profile_category?: string | null
          global_profile_description?: string | null
          global_profile_email?: string | null
          global_profile_image?: string | null
          global_profile_info?: string | null
          global_profile_name?: string | null
          global_profile_website?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string | null
          global_profile_address?: string | null
          global_profile_category?: string | null
          global_profile_description?: string | null
          global_profile_email?: string | null
          global_profile_image?: string | null
          global_profile_info?: string | null
          global_profile_name?: string | null
          global_profile_website?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      vpn_server_health: {
        Row: {
          consecutive_failures: number
          created_at: string
          error_message: string | null
          failure_count: number
          id: string
          is_healthy: boolean
          last_check_at: string | null
          last_failure_at: string | null
          last_success_at: string | null
          response_time_ms: number | null
          server_host: string
          server_region: string
          updated_at: string
        }
        Insert: {
          consecutive_failures?: number
          created_at?: string
          error_message?: string | null
          failure_count?: number
          id?: string
          is_healthy?: boolean
          last_check_at?: string | null
          last_failure_at?: string | null
          last_success_at?: string | null
          response_time_ms?: number | null
          server_host: string
          server_region?: string
          updated_at?: string
        }
        Update: {
          consecutive_failures?: number
          created_at?: string
          error_message?: string | null
          failure_count?: number
          id?: string
          is_healthy?: boolean
          last_check_at?: string | null
          last_failure_at?: string | null
          last_success_at?: string | null
          response_time_ms?: number | null
          server_host?: string
          server_region?: string
          updated_at?: string
        }
        Relationships: []
      }
      warmup_daily_history: {
        Row: {
          account_id: string
          created_at: string | null
          date: string
          id: string
          received_count: number | null
          sent_count: number | null
        }
        Insert: {
          account_id: string
          created_at?: string | null
          date: string
          id?: string
          received_count?: number | null
          sent_count?: number | null
        }
        Update: {
          account_id?: string
          created_at?: string | null
          date?: string
          id?: string
          received_count?: number | null
          sent_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "warmup_daily_history_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      warmup_phone_numbers: {
        Row: {
          created_at: string
          id: string
          phone_number: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          phone_number: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          phone_number?: string
          user_id?: string
        }
        Relationships: []
      }
      warmup_settings: {
        Row: {
          active_end_hour: number | null
          active_start_hour: number | null
          all_pairs: Json | null
          completed_rounds: number
          created_at: string
          current_pair_index: number
          id: string
          interval_minutes: number
          is_running: boolean
          last_message: string | null
          last_run_at: string | null
          max_delay_sec: number | null
          max_typing_ms: number | null
          messages_per_session: number
          messages_sent: number
          min_delay_sec: number | null
          min_typing_ms: number | null
          phase: string | null
          skipped_pairs: number
          sleep_end_hour: number | null
          sleep_start_hour: number | null
          started_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          active_end_hour?: number | null
          active_start_hour?: number | null
          all_pairs?: Json | null
          completed_rounds?: number
          created_at?: string
          current_pair_index?: number
          id?: string
          interval_minutes?: number
          is_running?: boolean
          last_message?: string | null
          last_run_at?: string | null
          max_delay_sec?: number | null
          max_typing_ms?: number | null
          messages_per_session?: number
          messages_sent?: number
          min_delay_sec?: number | null
          min_typing_ms?: number | null
          phase?: string | null
          skipped_pairs?: number
          sleep_end_hour?: number | null
          sleep_start_hour?: number | null
          started_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          active_end_hour?: number | null
          active_start_hour?: number | null
          all_pairs?: Json | null
          completed_rounds?: number
          created_at?: string
          current_pair_index?: number
          id?: string
          interval_minutes?: number
          is_running?: boolean
          last_message?: string | null
          last_run_at?: string | null
          max_delay_sec?: number | null
          max_typing_ms?: number | null
          messages_per_session?: number
          messages_sent?: number
          min_delay_sec?: number | null
          min_typing_ms?: number | null
          phase?: string | null
          skipped_pairs?: number
          sleep_end_hour?: number | null
          sleep_start_hour?: number | null
          started_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      whatsapp_accounts: {
        Row: {
          account_name: string
          active_config_id: string | null
          created_at: string
          display_order: number | null
          failover_count: number | null
          id: string
          last_connected_at: string | null
          last_failover_at: string | null
          phone_number: string
          proxy_country: string | null
          proxy_server: string | null
          qr_code: string | null
          session_data: Json | null
          status: string
          updated_at: string
          user_id: string
          wireguard_backup_config_id: string | null
          wireguard_config_id: string | null
          wireguard_tertiary_config_id: string | null
        }
        Insert: {
          account_name: string
          active_config_id?: string | null
          created_at?: string
          display_order?: number | null
          failover_count?: number | null
          id?: string
          last_connected_at?: string | null
          last_failover_at?: string | null
          phone_number: string
          proxy_country?: string | null
          proxy_server?: string | null
          qr_code?: string | null
          session_data?: Json | null
          status?: string
          updated_at?: string
          user_id: string
          wireguard_backup_config_id?: string | null
          wireguard_config_id?: string | null
          wireguard_tertiary_config_id?: string | null
        }
        Update: {
          account_name?: string
          active_config_id?: string | null
          created_at?: string
          display_order?: number | null
          failover_count?: number | null
          id?: string
          last_connected_at?: string | null
          last_failover_at?: string | null
          phone_number?: string
          proxy_country?: string | null
          proxy_server?: string | null
          qr_code?: string | null
          session_data?: Json | null
          status?: string
          updated_at?: string
          user_id?: string
          wireguard_backup_config_id?: string | null
          wireguard_config_id?: string | null
          wireguard_tertiary_config_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_accounts_active_config_id_fkey"
            columns: ["active_config_id"]
            isOneToOne: false
            referencedRelation: "wireguard_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_accounts_wireguard_backup_config_id_fkey"
            columns: ["wireguard_backup_config_id"]
            isOneToOne: false
            referencedRelation: "wireguard_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_accounts_wireguard_config_id_fkey"
            columns: ["wireguard_config_id"]
            isOneToOne: false
            referencedRelation: "wireguard_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_accounts_wireguard_tertiary_config_id_fkey"
            columns: ["wireguard_tertiary_config_id"]
            isOneToOne: false
            referencedRelation: "wireguard_configs"
            referencedColumns: ["id"]
          },
        ]
      }
      wireguard_configs: {
        Row: {
          config_content: string
          config_name: string
          created_at: string
          id: string
          public_key: string | null
          server_location: string
          updated_at: string
          user_id: string
        }
        Insert: {
          config_content: string
          config_name: string
          created_at?: string
          id?: string
          public_key?: string | null
          server_location?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          config_content?: string
          config_name?: string
          created_at?: string
          id?: string
          public_key?: string | null
          server_location?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      wireguard_health: {
        Row: {
          config_id: string
          consecutive_failures: number
          created_at: string
          error_message: string | null
          failure_count: number
          id: string
          is_healthy: boolean
          last_check_at: string | null
          last_failure_at: string | null
          last_success_at: string | null
          updated_at: string
        }
        Insert: {
          config_id: string
          consecutive_failures?: number
          created_at?: string
          error_message?: string | null
          failure_count?: number
          id?: string
          is_healthy?: boolean
          last_check_at?: string | null
          last_failure_at?: string | null
          last_success_at?: string | null
          updated_at?: string
        }
        Update: {
          config_id?: string
          consecutive_failures?: number
          created_at?: string
          error_message?: string | null
          failure_count?: number
          id?: string
          is_healthy?: boolean
          last_check_at?: string | null
          last_failure_at?: string | null
          last_success_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wireguard_health_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: true
            referencedRelation: "wireguard_configs"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      increment_warmup_stats: {
        Args: { p_account_id: string; p_count?: number; p_to_phone: string }
        Returns: undefined
      }
      mark_vpn_server_healthy: {
        Args: { p_response_time_ms?: number; p_server_host: string }
        Returns: undefined
      }
      mark_vpn_server_unhealthy: {
        Args: { p_error_message?: string; p_server_host: string }
        Returns: undefined
      }
      mark_wireguard_healthy: {
        Args: { p_config_id: string }
        Returns: undefined
      }
      mark_wireguard_unhealthy: {
        Args: { p_config_id: string; p_error_message?: string }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
