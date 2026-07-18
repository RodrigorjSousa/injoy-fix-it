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
      app_settings: {
        Row: {
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      ativos_ar: {
        Row: {
          created_at: string
          id: string
          intervalo_dias: number
          localizacao: string
          status: string
          tecnico: string | null
          tecnico_id: string | null
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
          tecnico_id?: string | null
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
          tecnico_id?: string | null
          ultima_limpeza?: string | null
          unidade?: Database["public"]["Enums"]["unidade"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ativos_ar_tecnico_id_fkey"
            columns: ["tecnico_id"]
            isOneToOne: false
            referencedRelation: "funcionarios"
            referencedColumns: ["id"]
          },
        ]
      }
      auditorias_almoxarifado: {
        Row: {
          concluido_em: string | null
          created_at: string
          funcionario_id: string
          funcionario_nome: string
          gestor_id: string | null
          gestor_nome: string | null
          id: string
          iniciado_em: string | null
          prazo_ate: string | null
          relatorio_final: string | null
          status: string
          tempo_limite: string
          unidade: string
          updated_at: string
        }
        Insert: {
          concluido_em?: string | null
          created_at?: string
          funcionario_id: string
          funcionario_nome: string
          gestor_id?: string | null
          gestor_nome?: string | null
          id?: string
          iniciado_em?: string | null
          prazo_ate?: string | null
          relatorio_final?: string | null
          status?: string
          tempo_limite: string
          unidade: string
          updated_at?: string
        }
        Update: {
          concluido_em?: string | null
          created_at?: string
          funcionario_id?: string
          funcionario_nome?: string
          gestor_id?: string | null
          gestor_nome?: string | null
          id?: string
          iniciado_em?: string | null
          prazo_ate?: string | null
          relatorio_final?: string | null
          status?: string
          tempo_limite?: string
          unidade?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "auditorias_almoxarifado_funcionario_id_fkey"
            columns: ["funcionario_id"]
            isOneToOne: false
            referencedRelation: "funcionarios"
            referencedColumns: ["id"]
          },
        ]
      }
      beverage_catalog: {
        Row: {
          created_at: string
          current_stock: number
          id: string
          min_stock: number
          name: string
          price: number
          property: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_stock?: number
          id?: string
          min_stock?: number
          name: string
          price?: number
          property: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_stock?: number
          id?: string
          min_stock?: number
          name?: string
          price?: number
          property?: string
          updated_at?: string
        }
        Relationships: []
      }
      beverage_sales: {
        Row: {
          created_at: string
          id: string
          payment_method: string
          product_id: string | null
          product_name: string
          property: string
          quantity: number
          registered_by: string
          room_number: string | null
          total_price: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          id?: string
          payment_method: string
          product_id?: string | null
          product_name: string
          property: string
          quantity: number
          registered_by: string
          room_number?: string | null
          total_price: number
          unit_price: number
        }
        Update: {
          created_at?: string
          id?: string
          payment_method?: string
          product_id?: string | null
          product_name?: string
          property?: string
          quantity?: number
          registered_by?: string
          room_number?: string | null
          total_price?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "beverage_sales_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "beverage_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_reviews: {
        Row: {
          cleanliness_score: number | null
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          overall_score: number
          reference_date: string
          sample_size: number | null
          staff_score: number | null
          unidade: string
          updated_at: string
        }
        Insert: {
          cleanliness_score?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          overall_score: number
          reference_date: string
          sample_size?: number | null
          staff_score?: number | null
          unidade: string
          updated_at?: string
        }
        Update: {
          cleanliness_score?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          overall_score?: number
          reference_date?: string
          sample_size?: number | null
          staff_score?: number | null
          unidade?: string
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
          midias: Json
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
          midias?: Json
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
          midias?: Json
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
      cloudbeds_checkout_logs: {
        Row: {
          camareira_id: string | null
          camareira_name: string
          created_at: string
          guest_name: string | null
          id: string
          property: string
          reservation_id: string | null
          room_number: string
        }
        Insert: {
          camareira_id?: string | null
          camareira_name: string
          created_at?: string
          guest_name?: string | null
          id?: string
          property: string
          reservation_id?: string | null
          room_number: string
        }
        Update: {
          camareira_id?: string | null
          camareira_name?: string
          created_at?: string
          guest_name?: string | null
          id?: string
          property?: string
          reservation_id?: string | null
          room_number?: string
        }
        Relationships: []
      }
      config_bonificacao: {
        Row: {
          created_at: string
          id: string
          penalidade_1_ruim: number
          penalidade_2_ruins: number
          updated_at: string
          valor_elogio: number
          valor_nota_10: number
          valor_nota_9: number
        }
        Insert: {
          created_at?: string
          id?: string
          penalidade_1_ruim?: number
          penalidade_2_ruins?: number
          updated_at?: string
          valor_elogio?: number
          valor_nota_10?: number
          valor_nota_9?: number
        }
        Update: {
          created_at?: string
          id?: string
          penalidade_1_ruim?: number
          penalidade_2_ruins?: number
          updated_at?: string
          valor_elogio?: number
          valor_nota_10?: number
          valor_nota_9?: number
        }
        Relationships: []
      }
      daily_period_status: {
        Row: {
          completed_at: string | null
          completed_by: string | null
          id: string
          is_completed: boolean
          period: string
          property: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          completed_by?: string | null
          id?: string
          is_completed?: boolean
          period: string
          property: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          completed_by?: string | null
          id?: string
          is_completed?: boolean
          period?: string
          property?: string
          updated_at?: string
        }
        Relationships: []
      }
      extra_tasks_directory: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      extra_tasks_logs: {
        Row: {
          camareira_name: string
          completed_tasks: Json
          created_at: string
          id: string
          property: string
        }
        Insert: {
          camareira_name: string
          completed_tasks: Json
          created_at?: string
          id?: string
          property: string
        }
        Update: {
          camareira_name?: string
          completed_tasks?: Json
          created_at?: string
          id?: string
          property?: string
        }
        Relationships: []
      }
      funcionarios: {
        Row: {
          categorias: string[]
          cpf: string | null
          created_at: string
          email: string
          id: string
          nome: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          categorias?: string[]
          cpf?: string | null
          created_at?: string
          email: string
          id?: string
          nome: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          categorias?: string[]
          cpf?: string | null
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
          available_rooms: number | null
          clean_rooms: number
          created_at: string
          date: string
          dirty_rooms: number
          id: string
          maintenance_rooms: number
          occupancy_percentage: number
          pending_balance: number
          pending_docs_count: number | null
          property: string
          rating: number | null
          updated_at: string
        }
        Insert: {
          available_rooms?: number | null
          clean_rooms?: number
          created_at?: string
          date: string
          dirty_rooms?: number
          id?: string
          maintenance_rooms?: number
          occupancy_percentage?: number
          pending_balance?: number
          pending_docs_count?: number | null
          property: string
          rating?: number | null
          updated_at?: string
        }
        Update: {
          available_rooms?: number | null
          clean_rooms?: number
          created_at?: string
          date?: string
          dirty_rooms?: number
          id?: string
          maintenance_rooms?: number
          occupancy_percentage?: number
          pending_balance?: number
          pending_docs_count?: number | null
          property?: string
          rating?: number | null
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
      inventory_items: {
        Row: {
          created_at: string
          current_stock: number
          id: string
          min_stock: number
          name: string
          property: string
          sector: string
          unit_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_stock?: number
          id?: string
          min_stock?: number
          name: string
          property: string
          sector: string
          unit_type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_stock?: number
          id?: string
          min_stock?: number
          name?: string
          property?: string
          sector?: string
          unit_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      inventory_requests: {
        Row: {
          audited_by: string | null
          created_at: string
          id: string
          item_id: string | null
          property: string
          purpose: string | null
          quantity: number
          requested_by: string
          status: string
          updated_at: string
        }
        Insert: {
          audited_by?: string | null
          created_at?: string
          id?: string
          item_id?: string | null
          property: string
          purpose?: string | null
          quantity: number
          requested_by: string
          status?: string
          updated_at?: string
        }
        Update: {
          audited_by?: string | null
          created_at?: string
          id?: string
          item_id?: string | null
          property?: string
          purpose?: string | null
          quantity?: number
          requested_by?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_requests_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_sectors: {
        Row: {
          created_at: string
          id: string
          name: string
          property: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          property: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          property?: string
          updated_at?: string
        }
        Relationships: []
      }
      laundry_batches: {
        Row: {
          batch_id: string
          created_at: string
          items_received: Json | null
          items_sent: Json
          missing_items: Json | null
          notes: string | null
          property: string
          received_at: string | null
          received_by: string | null
          sent_at: string
          sent_by: string
          status: string
          updated_at: string
        }
        Insert: {
          batch_id: string
          created_at?: string
          items_received?: Json | null
          items_sent: Json
          missing_items?: Json | null
          notes?: string | null
          property: string
          received_at?: string | null
          received_by?: string | null
          sent_at?: string
          sent_by: string
          status?: string
          updated_at?: string
        }
        Update: {
          batch_id?: string
          created_at?: string
          items_received?: Json | null
          items_sent?: Json
          missing_items?: Json | null
          notes?: string | null
          property?: string
          received_at?: string | null
          received_by?: string | null
          sent_at?: string
          sent_by?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      laundry_debt: {
        Row: {
          batch_id: string | null
          created_at: string
          id: string
          item_name: string
          property: string
          quantity_missing: number
          resolved_at: string | null
          resolved_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          batch_id?: string | null
          created_at?: string
          id?: string
          item_name: string
          property: string
          quantity_missing: number
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          batch_id?: string | null
          created_at?: string
          id?: string
          item_name?: string
          property?: string
          quantity_missing?: number
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "laundry_debt_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "laundry_batches"
            referencedColumns: ["batch_id"]
          },
        ]
      }
      laundry_items_directory: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      laundry_logs: {
        Row: {
          camareira_name: string
          created_at: string
          id: string
          items_data: Json
          property: string
        }
        Insert: {
          camareira_name: string
          created_at?: string
          id?: string
          items_data: Json
          property: string
        }
        Update: {
          camareira_name?: string
          created_at?: string
          id?: string
          items_data?: Json
          property?: string
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
      period_checklist_logs: {
        Row: {
          camareira_name: string
          completed_items: Json
          created_at: string
          id: string
          period: string
          property: string
        }
        Insert: {
          camareira_name: string
          completed_items?: Json
          created_at?: string
          id?: string
          period: string
          property: string
        }
        Update: {
          camareira_name?: string
          completed_items?: Json
          created_at?: string
          id?: string
          period?: string
          property?: string
        }
        Relationships: []
      }
      period_items_directory: {
        Row: {
          created_at: string
          id: string
          item_name: string
          period: string
          property: string
        }
        Insert: {
          created_at?: string
          id?: string
          item_name: string
          period: string
          property: string
        }
        Update: {
          created_at?: string
          id?: string
          item_name?: string
          period?: string
          property?: string
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
      purchase_requests: {
        Row: {
          category: string | null
          created_at: string
          id: string
          item_name: string
          notes: string | null
          property: string
          quantity: number
          requested_by: string
          requester_role: string
          requester_user_id: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          unit: string | null
          updated_at: string
          urgency: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          id?: string
          item_name: string
          notes?: string | null
          property: string
          quantity?: number
          requested_by: string
          requester_role: string
          requester_user_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          unit?: string | null
          updated_at?: string
          urgency?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          id?: string
          item_name?: string
          notes?: string | null
          property?: string
          quantity?: number
          requested_by?: string
          requester_role?: string
          requester_user_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          unit?: string | null
          updated_at?: string
          urgency?: string
        }
        Relationships: []
      }
      recados_camareiras: {
        Row: {
          created_at: string
          created_by: string | null
          created_by_name: string
          direction: string
          id: string
          message: string
          property: string
          read_at: string | null
          read_by: string | null
          room_number: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          created_by_name: string
          direction?: string
          id?: string
          message: string
          property: string
          read_at?: string | null
          read_by?: string | null
          room_number?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          created_by_name?: string
          direction?: string
          id?: string
          message?: string
          property?: string
          read_at?: string | null
          read_by?: string | null
          room_number?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      recados_gestor: {
        Row: {
          created_at: string
          gestor_id: string | null
          gestor_nome: string
          id: string
          mensagem: string
          midia_tipo: string | null
          midia_url: string | null
          setor: string
          unidade: string
        }
        Insert: {
          created_at?: string
          gestor_id?: string | null
          gestor_nome: string
          id?: string
          mensagem: string
          midia_tipo?: string | null
          midia_url?: string | null
          setor: string
          unidade: string
        }
        Update: {
          created_at?: string
          gestor_id?: string | null
          gestor_nome?: string
          id?: string
          mensagem?: string
          midia_tipo?: string | null
          midia_url?: string | null
          setor?: string
          unidade?: string
        }
        Relationships: []
      }
      registro_ponto_pontomais: {
        Row: {
          almoco_retorno: string | null
          almoco_saida: string | null
          created_at: string
          data: string
          entrada: string | null
          funcionario_id: string
          id: string
          saida: string | null
          ultima_atualizacao: string
          updated_at: string
        }
        Insert: {
          almoco_retorno?: string | null
          almoco_saida?: string | null
          created_at?: string
          data: string
          entrada?: string | null
          funcionario_id: string
          id?: string
          saida?: string | null
          ultima_atualizacao?: string
          updated_at?: string
        }
        Update: {
          almoco_retorno?: string | null
          almoco_saida?: string | null
          created_at?: string
          data?: string
          entrada?: string | null
          funcionario_id?: string
          id?: string
          saida?: string | null
          ultima_atualizacao?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "registro_ponto_pontomais_funcionario_id_fkey"
            columns: ["funcionario_id"]
            isOneToOne: false
            referencedRelation: "funcionarios"
            referencedColumns: ["id"]
          },
        ]
      }
      registros_bonificacao: {
        Row: {
          created_at: string
          criado_por: string | null
          data: string
          id: string
          nome_hospede: string
          nota_funcionarios: number
          nota_geral: number
          observacao: string | null
          teve_elogio: boolean
          unidade: string
          updated_at: string
          valor_calculado: number
        }
        Insert: {
          created_at?: string
          criado_por?: string | null
          data?: string
          id?: string
          nome_hospede: string
          nota_funcionarios: number
          nota_geral: number
          observacao?: string | null
          teve_elogio?: boolean
          unidade: string
          updated_at?: string
          valor_calculado?: number
        }
        Update: {
          created_at?: string
          criado_por?: string | null
          data?: string
          id?: string
          nome_hospede?: string
          nota_funcionarios?: number
          nota_geral?: number
          observacao?: string | null
          teve_elogio?: boolean
          unidade?: string
          updated_at?: string
          valor_calculado?: number
        }
        Relationships: []
      }
      room_housekeeping: {
        Row: {
          arrival_time: string | null
          assigned_camareira: string | null
          assigned_task: string | null
          blink_troca: boolean
          color_code: string | null
          condition: string | null
          dnd_photo_url: string | null
          guest_name: string | null
          has_pending_docs: boolean | null
          has_pending_payment: boolean | null
          id: string
          is_dnd: boolean
          pax: number | null
          pending_payment_amount: number | null
          property: string
          room_comment: string | null
          room_number: string
          room_type: string | null
          service_ended_at: string | null
          service_started_at: string | null
          service_status: string
          status: string | null
          updated_at: string
        }
        Insert: {
          arrival_time?: string | null
          assigned_camareira?: string | null
          assigned_task?: string | null
          blink_troca?: boolean
          color_code?: string | null
          condition?: string | null
          dnd_photo_url?: string | null
          guest_name?: string | null
          has_pending_docs?: boolean | null
          has_pending_payment?: boolean | null
          id?: string
          is_dnd?: boolean
          pax?: number | null
          pending_payment_amount?: number | null
          property: string
          room_comment?: string | null
          room_number: string
          room_type?: string | null
          service_ended_at?: string | null
          service_started_at?: string | null
          service_status?: string
          status?: string | null
          updated_at?: string
        }
        Update: {
          arrival_time?: string | null
          assigned_camareira?: string | null
          assigned_task?: string | null
          blink_troca?: boolean
          color_code?: string | null
          condition?: string | null
          dnd_photo_url?: string | null
          guest_name?: string | null
          has_pending_docs?: boolean | null
          has_pending_payment?: boolean | null
          id?: string
          is_dnd?: boolean
          pax?: number | null
          pending_payment_amount?: number | null
          property?: string
          room_comment?: string | null
          room_number?: string
          room_type?: string | null
          service_ended_at?: string | null
          service_started_at?: string | null
          service_status?: string
          status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      room_housekeeping_history: {
        Row: {
          action_type: string
          camareira_name: string
          comment: string | null
          created_at: string
          ended_at: string | null
          id: string
          photo_url: string | null
          property: string
          room_number: string
          started_at: string | null
          task_name: string
        }
        Insert: {
          action_type: string
          camareira_name: string
          comment?: string | null
          created_at?: string
          ended_at?: string | null
          id?: string
          photo_url?: string | null
          property: string
          room_number: string
          started_at?: string | null
          task_name: string
        }
        Update: {
          action_type?: string
          camareira_name?: string
          comment?: string | null
          created_at?: string
          ended_at?: string | null
          id?: string
          photo_url?: string | null
          property?: string
          room_number?: string
          started_at?: string | null
          task_name?: string
        }
        Relationships: []
      }
      room_inspections: {
        Row: {
          checklist: Json
          created_at: string
          id: string
          inspector_id: string | null
          inspector_name: string | null
          photo_url: string
          property: string
          room_number: string
        }
        Insert: {
          checklist: Json
          created_at?: string
          id?: string
          inspector_id?: string | null
          inspector_name?: string | null
          photo_url: string
          property: string
          room_number: string
        }
        Update: {
          checklist?: Json
          created_at?: string
          id?: string
          inspector_id?: string | null
          inspector_name?: string | null
          photo_url?: string
          property?: string
          room_number?: string
        }
        Relationships: []
      }
      rotinas_config: {
        Row: {
          checklist: string[]
          created_at: string
          escopo_unidade: string
          frequencia_dias: number
          id: string
          titulo: string
          updated_at: string
        }
        Insert: {
          checklist?: string[]
          created_at?: string
          escopo_unidade: string
          frequencia_dias: number
          id?: string
          titulo: string
          updated_at?: string
        }
        Update: {
          checklist?: string[]
          created_at?: string
          escopo_unidade?: string
          frequencia_dias?: number
          id?: string
          titulo?: string
          updated_at?: string
        }
        Relationships: []
      }
      rotinas_historico: {
        Row: {
          created_at: string
          data_execucao: string
          id: string
          observacoes: string | null
          registrado_por: string | null
          rotina_local_id: string
          tecnico: string
        }
        Insert: {
          created_at?: string
          data_execucao?: string
          id?: string
          observacoes?: string | null
          registrado_por?: string | null
          rotina_local_id: string
          tecnico: string
        }
        Update: {
          created_at?: string
          data_execucao?: string
          id?: string
          observacoes?: string | null
          registrado_por?: string | null
          rotina_local_id?: string
          tecnico?: string
        }
        Relationships: [
          {
            foreignKeyName: "rotinas_historico_rotina_local_id_fkey"
            columns: ["rotina_local_id"]
            isOneToOne: false
            referencedRelation: "rotinas_locais"
            referencedColumns: ["id"]
          },
        ]
      }
      rotinas_locais: {
        Row: {
          created_at: string
          id: string
          nome_local: string
          rotina_config_id: string
          ultima_execucao: string | null
          ultimo_tecnico: string | null
          unidade: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          nome_local: string
          rotina_config_id: string
          ultima_execucao?: string | null
          ultimo_tecnico?: string | null
          unidade: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          nome_local?: string
          rotina_config_id?: string
          ultima_execucao?: string | null
          ultimo_tecnico?: string | null
          unidade?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rotinas_locais_rotina_config_id_fkey"
            columns: ["rotina_config_id"]
            isOneToOne: false
            referencedRelation: "rotinas_config"
            referencedColumns: ["id"]
          },
        ]
      }
      trocas_turno: {
        Row: {
          caixa_obs: string | null
          caixa_status: string
          created_at: string
          estoque_obs: string | null
          estoque_status: string
          funcionario_entrada: string
          funcionario_saida: string
          funcionario_saida_user_id: string | null
          gastos_detalhes: string | null
          id: string
          maquina_bebidas: string | null
          observacoes: string | null
          unidade: string
          updated_at: string
        }
        Insert: {
          caixa_obs?: string | null
          caixa_status?: string
          created_at?: string
          estoque_obs?: string | null
          estoque_status?: string
          funcionario_entrada: string
          funcionario_saida: string
          funcionario_saida_user_id?: string | null
          gastos_detalhes?: string | null
          id?: string
          maquina_bebidas?: string | null
          observacoes?: string | null
          unidade: string
          updated_at?: string
        }
        Update: {
          caixa_obs?: string | null
          caixa_status?: string
          created_at?: string
          estoque_obs?: string | null
          estoque_status?: string
          funcionario_entrada?: string
          funcionario_saida?: string
          funcionario_saida_user_id?: string | null
          gastos_detalhes?: string | null
          id?: string
          maquina_bebidas?: string | null
          observacoes?: string | null
          unidade?: string
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
      vistoria_checklist_items: {
        Row: {
          created_at: string
          id: string
          item_name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          item_name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          item_name?: string
          sort_order?: number
          updated_at?: string
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
      list_camareiras: {
        Args: never
        Returns: {
          id: string
          nome: string
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
