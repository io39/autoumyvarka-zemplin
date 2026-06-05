export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string
          actor_email: string
          actor_staff_id: string | null
          created_at: string
          details: Json | null
          entity_id: string | null
          entity_type: string
          id: string
          order_id: string | null
        }
        Insert: {
          action: string
          actor_email: string
          actor_staff_id?: string | null
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type: string
          id?: string
          order_id?: string | null
        }
        Update: {
          action?: string
          actor_email?: string
          actor_staff_id?: string | null
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_staff_id_fkey"
            columns: ["actor_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      cars: {
        Row: {
          brand: string | null
          created_at: string
          id: string
          model: string | null
          pricing_category: Database["public"]["Enums"]["pricing_category"]
          spz: string
        }
        Insert: {
          brand?: string | null
          created_at?: string
          id?: string
          model?: string | null
          pricing_category: Database["public"]["Enums"]["pricing_category"]
          spz: string
        }
        Update: {
          brand?: string | null
          created_at?: string
          id?: string
          model?: string | null
          pricing_category?: Database["public"]["Enums"]["pricing_category"]
          spz?: string
        }
        Relationships: []
      }
      client_cars: {
        Row: {
          car_id: string
          client_id: string
          created_at: string
        }
        Insert: {
          car_id: string
          client_id: string
          created_at?: string
        }
        Update: {
          car_id?: string
          client_id?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_cars_car_id_fkey"
            columns: ["car_id"]
            isOneToOne: false
            referencedRelation: "cars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_cars_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          created_at: string
          id: string
          name: string | null
          phone: string
        }
        Insert: {
          created_at?: string
          id?: string
          name?: string | null
          phone: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string | null
          phone?: string
        }
        Relationships: []
      }
      day_overrides: {
        Row: {
          close_time: string | null
          day: string
          is_closed: boolean
          label: string | null
          open_time: string | null
        }
        Insert: {
          close_time?: string | null
          day: string
          is_closed?: boolean
          label?: string | null
          open_time?: string | null
        }
        Update: {
          close_time?: string | null
          day?: string
          is_closed?: boolean
          label?: string | null
          open_time?: string | null
        }
        Relationships: []
      }
      opening_hours: {
        Row: {
          close_time: string | null
          day_of_week: number
          is_closed: boolean
          open_time: string | null
        }
        Insert: {
          close_time?: string | null
          day_of_week: number
          is_closed?: boolean
          open_time?: string | null
        }
        Update: {
          close_time?: string | null
          day_of_week?: number
          is_closed?: boolean
          open_time?: string | null
        }
        Relationships: []
      }
      order_services: {
        Row: {
          added_at: string
          added_by: string
          category_snapshot:
            | Database["public"]["Enums"]["pricing_category"]
            | null
          duration_min_snapshot: number | null
          id: string
          name_snapshot: string
          order_id: string
          paid: boolean
          price_cents_snapshot: number
          quantity: number
          removed_at: string | null
          service_id: string
        }
        Insert: {
          added_at?: string
          added_by: string
          category_snapshot?:
            | Database["public"]["Enums"]["pricing_category"]
            | null
          duration_min_snapshot?: number | null
          id?: string
          name_snapshot: string
          order_id: string
          paid?: boolean
          price_cents_snapshot: number
          quantity?: number
          removed_at?: string | null
          service_id: string
        }
        Update: {
          added_at?: string
          added_by?: string
          category_snapshot?:
            | Database["public"]["Enums"]["pricing_category"]
            | null
          duration_min_snapshot?: number | null
          id?: string
          name_snapshot?: string
          order_id?: string
          paid?: boolean
          price_cents_snapshot?: number
          quantity?: number
          removed_at?: string | null
          service_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_services_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_services_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_services_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      order_staff: {
        Row: {
          assigned_at: string
          assigned_by: string
          order_id: string
          worker_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by: string
          order_id: string
          worker_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string
          order_id?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_staff_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_staff_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_staff_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          box: number
          car_id: string
          client_id: string
          created_at: string
          created_by: string
          deleted_at: string | null
          duration_min: number
          ends_at: string
          id: string
          note: string | null
          reminded_at: string | null
          starts_at: string
          status: Database["public"]["Enums"]["order_status"]
          updated_at: string
        }
        Insert: {
          box: number
          car_id: string
          client_id: string
          created_at?: string
          created_by: string
          deleted_at?: string | null
          duration_min: number
          ends_at: string
          id?: string
          note?: string | null
          reminded_at?: string | null
          starts_at: string
          status?: Database["public"]["Enums"]["order_status"]
          updated_at?: string
        }
        Update: {
          box?: number
          car_id?: string
          client_id?: string
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          duration_min?: number
          ends_at?: string
          id?: string
          note?: string | null
          reminded_at?: string | null
          starts_at?: string
          status?: Database["public"]["Enums"]["order_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_car_id_fkey"
            columns: ["car_id"]
            isOneToOne: false
            referencedRelation: "cars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      service_prices: {
        Row: {
          duration_min: number | null
          id: string
          price_cents: number
          price_from: boolean
          pricing_category:
            | Database["public"]["Enums"]["pricing_category"]
            | null
          service_id: string
        }
        Insert: {
          duration_min?: number | null
          id?: string
          price_cents: number
          price_from?: boolean
          pricing_category?:
            | Database["public"]["Enums"]["pricing_category"]
            | null
          service_id: string
        }
        Update: {
          duration_min?: number | null
          id?: string
          price_cents?: number
          price_from?: boolean
          pricing_category?:
            | Database["public"]["Enums"]["pricing_category"]
            | null
          service_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_prices_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          active: boolean
          created_at: string
          id: string
          is_per_unit: boolean
          kind: Database["public"]["Enums"]["service_kind"]
          name: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          is_per_unit?: boolean
          kind: Database["public"]["Enums"]["service_kind"]
          name: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          is_per_unit?: boolean
          kind?: Database["public"]["Enums"]["service_kind"]
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      sms_messages: {
        Row: {
          body: string
          created_at: string
          delivered_at: string | null
          error: string | null
          id: string
          order_id: string
          phone: string
          provider_message_id: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["sms_status"]
          type: Database["public"]["Enums"]["sms_type"]
        }
        Insert: {
          body: string
          created_at?: string
          delivered_at?: string | null
          error?: string | null
          id?: string
          order_id: string
          phone: string
          provider_message_id?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["sms_status"]
          type: Database["public"]["Enums"]["sms_type"]
        }
        Update: {
          body?: string
          created_at?: string
          delivered_at?: string | null
          error?: string | null
          id?: string
          order_id?: string
          phone?: string
          provider_message_id?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["sms_status"]
          type?: Database["public"]["Enums"]["sms_type"]
        }
        Relationships: [
          {
            foreignKeyName: "sms_messages_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_templates: {
        Row: {
          body: string
          type: Database["public"]["Enums"]["sms_type"]
          updated_at: string
        }
        Insert: {
          body: string
          type: Database["public"]["Enums"]["sms_type"]
          updated_at?: string
        }
        Update: {
          body?: string
          type?: Database["public"]["Enums"]["sms_type"]
          updated_at?: string
        }
        Relationships: []
      }
      staff: {
        Row: {
          active: boolean
          created_at: string
          display_name: string
          email: string
          id: string
          role: Database["public"]["Enums"]["staff_role"]
        }
        Insert: {
          active?: boolean
          created_at?: string
          display_name: string
          email: string
          id?: string
          role: Database["public"]["Enums"]["staff_role"]
        }
        Update: {
          active?: boolean
          created_at?: string
          display_name?: string
          email?: string
          id?: string
          role?: Database["public"]["Enums"]["staff_role"]
        }
        Relationships: []
      }
      workers: {
        Row: {
          active: boolean
          created_at: string
          display_name: string
          id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          display_name: string
          id?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          display_name?: string
          id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      delete_client_cascade: {
        Args: { p_client_id: string }
        Returns: {
          deleted_orders: number
          deleted_cars: number
        }[]
      }
      search_clients: {
        Args: { lim?: number; q: string }
        Returns: {
          client_id: string
          matched_spz: string
          name: string
          phone: string
          score: number
        }[]
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      unaccent: { Args: { "": string }; Returns: string }
    }
    Enums: {
      order_status: "vytvorena" | "hotova" | "zaplatena" | "nedostavil_sa"
      pricing_category: "os" | "suv" | "van" | "dod" | "motorka" | "stavba"
      service_kind: "main" | "addon"
      sms_status: "pending" | "sent" | "delivered" | "failed"
      sms_type: "reminder" | "ready"
      staff_role: "manazer" | "prevadzka"
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
      order_status: ["vytvorena", "hotova", "zaplatena", "nedostavil_sa"],
      pricing_category: ["os", "suv", "van", "dod", "motorka", "stavba"],
      service_kind: ["main", "addon"],
      sms_status: ["pending", "sent", "delivered", "failed"],
      sms_type: ["reminder", "ready"],
      staff_role: ["manazer", "prevadzka"],
    },
  },
} as const

