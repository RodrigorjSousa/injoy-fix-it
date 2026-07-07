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
      ativos_ar: {
        Row: {
          created_at: string
          id: string
          intervalo_dias: number
          localizacao: string
          status: string
          tecnico: string | null
          ultima_limpeza: string | null
          unidade: Database["public"]["Enums"]["unidade"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id: string
          intervalo_dias?: number
          localizacao: string
          status?: string
          tecnico?: string | null
          ultima_limpeza?: string | null
          unidade: Database["public"]["Enums"]["unidade"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          intervalo_dias?: number
          localizacao?: string
          status?: string
          tecnico?: string | null
          ultima_limpeza?: string | null
          unidade?: Database["public"]["Enums"]["unidade"]
          updated_at?: string
        }
        Relationships: []
      }
      chamados: {
        Row: {
          categoria: string
          created_at: string
          criado_por: string | null
          descricao: string
          foto_antes: string | null
          foto_depois: string | null
          id: string
          responsavel_id: string | null
          status: Database["public"]["Enums"]["chamado_status"]
          unidade: Database["public"]["Enums"]["unidade"]
          updated_at: string
        }
        Insert: {
          categoria: string
          created_at?: string
          criado_por?: string | null
          descricao: string
          foto_antes?: string | null
          foto_depois?: string | null
          id?: string
          responsavel_id?: string | null
          status?: Database["public"]["Enums"]["chamado_status"]
          unidade: Database["public"]["Enums"]["unidade"]
          updated_at?: string
        }
        Update: {
          categoria?: string
          created_at?: string
          criado_por?: string | null
          descricao?: string
          foto_antes?: string | null
          foto_depois?: string | null
          id?: string
          responsavel_id?: string | null
          status?: Database["public"]["Enums"]["chamado_status"]
          unidade?: Database["public"]["Enums"]["unidade"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chamados_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "funcionarios"
            referencedColumns: ["id"]
          },
        ]
      }
      funcionarios: {
        Row: {
          categorias: string[]
          created_at: string
          email: string
          id: string
          nome: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          categorias?: string[]
          created_at?: string
          email: string
          id?: string
          nome: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          categorias?: string[]
          created_at?: string
          email?: string
          id?: string
          nome?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      hotel_metrics: {
        Row: {
          clean_rooms: number
          created_at: string
          date: string
          dirty_rooms: number
          id: string
          maintenance_rooms: number
          occupancy_percentage: number
          pending_balance: number
          property: string
          updated_at: string
        }
        Insert: {
          clean_rooms?: number
          created_at?: string
          date: string
          dirty_rooms?: number
          id?: string
          maintenance_rooms?: number
          occupancy_percentage?: number
          pending_balance?: number
          property: string
          updated_at?: string
        }
        Update: {
          clean_rooms?: number
          created_at?: string
          date?: string
          dirty_rooms?: number
          id?: string
          maintenance_rooms?: number
          occupancy_percentage?: number
          pending_balance?: number
          property?: string
          updated_at?: string
        }
        Relationships: []
      }
      housekeeping_tasks: {
        Row: {
          created_at: string
          data_saida: string | null
          documento_pendente: boolean
          hospede: string | null
          id: string
          pagamento_pendente: boolean
          pax: number | null
          quarto: string
          raw_payload: Json | null
          reservation_id: string | null
          status_limpeza: string
          unidade: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          data_saida?: string | null
          documento_pendente?: boolean
          hospede?: string | null
          id?: string
          pagamento_pendente?: boolean
          pax?: number | null
          quarto: string
          raw_payload?: Json | null
          reservation_id?: string | null
          status_limpeza?: string
          unidade?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          data_saida?: string | null
          documento_pendente?: boolean
          hospede?: string | null
          id?: string
          pagamento_pendente?: boolean
          pax?: number | null
          quarto?: string
          raw_payload?: Json | null
          reservation_id?: string | null
          status_limpeza?: string
          unidade?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      mensagens: {
        Row: {
          conteudo: string
          created_at: string
          destinatario_id: string
          id: string
          lida_em: string | null
          remetente_id: string
        }
        Insert: {
          conteudo: string
          created_at?: string
          destinatario_id: string
          id?: string
          lida_em?: string | null
          remetente_id: string
        }
        Update: {
          conteudo?: string
          created_at?: string
          destinatario_id?: string
          id?: string
          lida_em?: string | null
          remetente_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          id: string
          nome: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id: string
          nome?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          nome?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      chat_contacts: {
        Args: never
        Returns: {
          id: string
          nome: string
        }[]
      }
      get_camareiras_user_ids: {
        Args: never
        Returns: {
          user_id: string
        }[]
      }
      get_recepcao_user_ids: {
        Args: never
        Returns: {
          user_id: string
        }[]
      }
    }
    Enums: {
      app_role:
        | "gestor"
        | "funcionario"
        | "admin"
        | "recepcao"
        | "camareira"
        | "professor"
        | "aluno"
      chamado_status: "Aberto" | "Em Andamento" | "Concluído"
      unidade: "Botafogo" | "Ipanema"
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
      app_role: [
        "gestor",
        "funcionario",
        "admin",
        "recepcao",
        "camareira",
        "professor",
        "aluno",
      ],
      chamado_status: ["Aberto", "Em Andamento", "Concluído"],
      unidade: ["Botafogo", "Ipanema"],
    },
  },
} as const
