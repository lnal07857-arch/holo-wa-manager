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
          global_profile_cover_image: string | null
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
          global_profile_cover_image?: string | null
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
          global_profile_cover_image?: string | null
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
      whatsapp_accounts: {
        Row: {
          account_name: string
          created_at: string
          id: string
          last_connected_at: string | null
          phone_number: string
          qr_code: string | null
          session_data: Json | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_name: string
          created_at?: string
          id?: string
          last_connected_at?: string | null
          phone_number: string
          qr_code?: string | null
          session_data?: Json | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_name?: string
          created_at?: string
          id?: string
          last_connected_at?: string | null
          phone_number?: string
          qr_code?: string | null
          session_data?: Json | null
          status?: string
          updated_at?: string
          user_id?: string
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
