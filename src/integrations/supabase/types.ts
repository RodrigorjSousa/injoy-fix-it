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
          cloudbeds_item_id: string | null
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
          cloudbeds_item_id?: string | null
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
          cloudbeds_item_id?: string | null
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
      boas_vindas_config: {
        Row: {
          audience: string
          blocks: Json
          created_at: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          audience: string
          blocks?: Json
          created_at?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          audience?: string
          blocks?: Json
          created_at?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      bonificacao_acessos: {
        Row: {
          created_at: string
          liberado_por: string | null
          pode_editar: boolean
          pode_excluir: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          liberado_por?: string | null
          pode_editar?: boolean
          pode_excluir?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          liberado_por?: string | null
          pode_editar?: boolean
          pode_excluir?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      bonus_meta_config: {
        Row: {
          ativo: boolean
          id: number
          max_atrasos: number
          nota_minima: number
          tolerancia_minutos: number
          updated_at: string
          valor_por_pessoa: number
        }
        Insert: {
          ativo?: boolean
          id?: number
          max_atrasos?: number
          nota_minima?: number
          tolerancia_minutos?: number
          updated_at?: string
          valor_por_pessoa?: number
        }
        Update: {
          ativo?: boolean
          id?: number
          max_atrasos?: number
          nota_minima?: number
          tolerancia_minutos?: number
          updated_at?: string
          valor_por_pessoa?: number
        }
        Relationships: []
      }
      bonus_meta_ocorrencias: {
        Row: {
          data: string
          fonte: string | null
          funcionario_id: string
          hora_entrada: string | null
          hora_prevista: string | null
          id: string
          justificada: boolean
          minutos: number | null
          motivo: string | null
          origem: string
          revisado_por: string | null
          tipo: string
          updated_at: string
        }
        Insert: {
          data: string
          fonte?: string | null
          funcionario_id: string
          hora_entrada?: string | null
          hora_prevista?: string | null
          id?: string
          justificada?: boolean
          minutos?: number | null
          motivo?: string | null
          origem?: string
          revisado_por?: string | null
          tipo: string
          updated_at?: string
        }
        Update: {
          data?: string
          fonte?: string | null
          funcionario_id?: string
          hora_entrada?: string | null
          hora_prevista?: string | null
          id?: string
          justificada?: boolean
          minutos?: number | null
          motivo?: string | null
          origem?: string
          revisado_por?: string | null
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bonus_meta_ocorrencias_funcionario_id_fkey"
            columns: ["funcionario_id"]
            isOneToOne: false
            referencedRelation: "funcionarios"
            referencedColumns: ["id"]
          },
        ]
      }
      bonus_meta_participantes: {
        Row: {
          ativo: boolean
          colaborador_id: string | null
          created_at: string
          funcionario_id: string
          setor: string | null
          unidade: string
        }
        Insert: {
          ativo?: boolean
          colaborador_id?: string | null
          created_at?: string
          funcionario_id: string
          setor?: string | null
          unidade?: string
        }
        Update: {
          ativo?: boolean
          colaborador_id?: string | null
          created_at?: string
          funcionario_id?: string
          setor?: string | null
          unidade?: string
        }
        Relationships: [
          {
            foreignKeyName: "bonus_meta_participantes_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "escala_colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bonus_meta_participantes_funcionario_id_fkey"
            columns: ["funcionario_id"]
            isOneToOne: true
            referencedRelation: "funcionarios"
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
          concluido_em: string | null
          created_at: string
          criado_por: string | null
          descricao: string
          foto_antes: string | null
          foto_depois: string | null
          id: string
          midias: Json
          responsavel_id: string | null
          responsavel_nome: string | null
          status: Database["public"]["Enums"]["chamado_status"]
          unidade: Database["public"]["Enums"]["unidade"]
          updated_at: string
        }
        Insert: {
          categoria: string
          concluido_em?: string | null
          created_at?: string
          criado_por?: string | null
          descricao: string
          foto_antes?: string | null
          foto_depois?: string | null
          id?: string
          midias?: Json
          responsavel_id?: string | null
          responsavel_nome?: string | null
          status?: Database["public"]["Enums"]["chamado_status"]
          unidade: Database["public"]["Enums"]["unidade"]
          updated_at?: string
        }
        Update: {
          categoria?: string
          concluido_em?: string | null
          created_at?: string
          criado_por?: string | null
          descricao?: string
          foto_antes?: string | null
          foto_depois?: string | null
          id?: string
          midias?: Json
          responsavel_id?: string | null
          responsavel_nome?: string | null
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
      escala_alteracoes: {
        Row: {
          alterado_em: string
          alterado_por: string | null
          antes: Json
          colaborador_id: string | null
          data: string | null
          depois: Json
          escala_dia_id: string | null
          id: string
          motivo: string | null
        }
        Insert: {
          alterado_em?: string
          alterado_por?: string | null
          antes: Json
          colaborador_id?: string | null
          data?: string | null
          depois: Json
          escala_dia_id?: string | null
          id?: string
          motivo?: string | null
        }
        Update: {
          alterado_em?: string
          alterado_por?: string | null
          antes?: Json
          colaborador_id?: string | null
          data?: string | null
          depois?: Json
          escala_dia_id?: string | null
          id?: string
          motivo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "escala_alteracoes_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "escala_colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escala_alteracoes_escala_dia_id_fkey"
            columns: ["escala_dia_id"]
            isOneToOne: false
            referencedRelation: "escala_dias"
            referencedColumns: ["id"]
          },
        ]
      }
      escala_colaboradores: {
        Row: {
          ativo: boolean
          created_at: string
          funcionario_id: string | null
          id: string
          nome: string
          ponto_habilitado: boolean
          setor: string
          telefone: string | null
          turno_padrao: string | null
          unidade: string
          updated_at: string
          vinculo: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          funcionario_id?: string | null
          id?: string
          nome: string
          ponto_habilitado?: boolean
          setor: string
          telefone?: string | null
          turno_padrao?: string | null
          unidade: string
          updated_at?: string
          vinculo: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          funcionario_id?: string | null
          id?: string
          nome?: string
          ponto_habilitado?: boolean
          setor?: string
          telefone?: string | null
          turno_padrao?: string | null
          unidade?: string
          updated_at?: string
          vinculo?: string
        }
        Relationships: [
          {
            foreignKeyName: "escala_colaboradores_funcionario_id_fkey"
            columns: ["funcionario_id"]
            isOneToOne: false
            referencedRelation: "funcionarios"
            referencedColumns: ["id"]
          },
        ]
      }
      escala_dias: {
        Row: {
          colaborador_id: string
          created_at: string
          data: string
          hora_entrada: string | null
          hora_saida: string | null
          horas_contratadas: number | null
          id: string
          modalidade_id: string | null
          motivo: string | null
          motivo_chamada: string | null
          origem: string
          setor: string
          status: string
          substitui_colaborador_id: string | null
          turno: string
          unidade: string
          updated_at: string
          updated_by: string | null
          valor_combinado: number | null
        }
        Insert: {
          colaborador_id: string
          created_at?: string
          data: string
          hora_entrada?: string | null
          hora_saida?: string | null
          horas_contratadas?: number | null
          id?: string
          modalidade_id?: string | null
          motivo?: string | null
          motivo_chamada?: string | null
          origem: string
          setor: string
          status: string
          substitui_colaborador_id?: string | null
          turno: string
          unidade: string
          updated_at?: string
          updated_by?: string | null
          valor_combinado?: number | null
        }
        Update: {
          colaborador_id?: string
          created_at?: string
          data?: string
          hora_entrada?: string | null
          hora_saida?: string | null
          horas_contratadas?: number | null
          id?: string
          modalidade_id?: string | null
          motivo?: string | null
          motivo_chamada?: string | null
          origem?: string
          setor?: string
          status?: string
          substitui_colaborador_id?: string | null
          turno?: string
          unidade?: string
          updated_at?: string
          updated_by?: string | null
          valor_combinado?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "escala_dias_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "escala_colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escala_dias_modalidade_id_fkey"
            columns: ["modalidade_id"]
            isOneToOne: false
            referencedRelation: "escala_freelance_modalidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escala_dias_substitui_colaborador_id_fkey"
            columns: ["substitui_colaborador_id"]
            isOneToOne: false
            referencedRelation: "escala_colaboradores"
            referencedColumns: ["id"]
          },
        ]
      }
      escala_ferias: {
        Row: {
          colaborador_id: string
          created_at: string
          created_by: string | null
          fim: string
          folgas_extra: boolean
          folgas_hora_entrada: string | null
          folgas_horas: number | null
          folgas_modalidade_id: string | null
          folgas_valor: number | null
          hora_entrada: string | null
          horas_contratadas: number | null
          id: string
          inicio: string
          modalidade_id: string | null
          observacao: string | null
          substituto_id: string | null
          unidade: string
          updated_at: string
          valor_combinado: number | null
        }
        Insert: {
          colaborador_id: string
          created_at?: string
          created_by?: string | null
          fim: string
          folgas_extra?: boolean
          folgas_hora_entrada?: string | null
          folgas_horas?: number | null
          folgas_modalidade_id?: string | null
          folgas_valor?: number | null
          hora_entrada?: string | null
          horas_contratadas?: number | null
          id?: string
          inicio: string
          modalidade_id?: string | null
          observacao?: string | null
          substituto_id?: string | null
          unidade: string
          updated_at?: string
          valor_combinado?: number | null
        }
        Update: {
          colaborador_id?: string
          created_at?: string
          created_by?: string | null
          fim?: string
          folgas_extra?: boolean
          folgas_hora_entrada?: string | null
          folgas_horas?: number | null
          folgas_modalidade_id?: string | null
          folgas_valor?: number | null
          hora_entrada?: string | null
          horas_contratadas?: number | null
          id?: string
          inicio?: string
          modalidade_id?: string | null
          observacao?: string | null
          substituto_id?: string | null
          unidade?: string
          updated_at?: string
          valor_combinado?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "escala_ferias_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "escala_colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escala_ferias_folgas_modalidade_id_fkey"
            columns: ["folgas_modalidade_id"]
            isOneToOne: false
            referencedRelation: "escala_freelance_modalidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escala_ferias_modalidade_id_fkey"
            columns: ["modalidade_id"]
            isOneToOne: false
            referencedRelation: "escala_freelance_modalidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escala_ferias_substituto_id_fkey"
            columns: ["substituto_id"]
            isOneToOne: false
            referencedRelation: "escala_colaboradores"
            referencedColumns: ["id"]
          },
        ]
      }
      escala_freelance_modalidades: {
        Row: {
          ativo: boolean
          horas: number
          id: string
          motivo: string
          nome: string
          ordem: number
          unidade: string
          updated_at: string
          updated_by: string | null
          valor: number
        }
        Insert: {
          ativo?: boolean
          horas: number
          id?: string
          motivo: string
          nome: string
          ordem?: number
          unidade: string
          updated_at?: string
          updated_by?: string | null
          valor: number
        }
        Update: {
          ativo?: boolean
          horas?: number
          id?: string
          motivo?: string
          nome?: string
          ordem?: number
          unidade?: string
          updated_at?: string
          updated_by?: string | null
          valor?: number
        }
        Relationships: []
      }
      escala_freelance_modalidades_seed_guard: {
        Row: {
          id: number
          seeded_at: string
        }
        Insert: {
          id?: number
          seeded_at?: string
        }
        Update: {
          id?: number
          seeded_at?: string
        }
        Relationships: []
      }
      escala_meses: {
        Row: {
          competencia: string
          created_at: string
          id: string
          justificativa_publicacao: string | null
          publicada_em: string | null
          publicada_por: string | null
          setor: string
          status: string
          unidade: string
          updated_at: string
        }
        Insert: {
          competencia: string
          created_at?: string
          id?: string
          justificativa_publicacao?: string | null
          publicada_em?: string | null
          publicada_por?: string | null
          setor: string
          status?: string
          unidade: string
          updated_at?: string
        }
        Update: {
          competencia?: string
          created_at?: string
          id?: string
          justificativa_publicacao?: string | null
          publicada_em?: string | null
          publicada_por?: string | null
          setor?: string
          status?: string
          unidade?: string
          updated_at?: string
        }
        Relationships: []
      }
      escala_padroes: {
        Row: {
          colaborador_id: string
          created_at: string
          data_base: string | null
          dias_ipanema: number[] | null
          distribuicao: string | null
          folga_semana_a: number | null
          folga_semana_b: number | null
          folgas_fixas: number[]
          hora_entrada: string | null
          hora_saida: string | null
          id: string
          intervalo_minutos: number | null
          proporcao_botafogo: number | null
          proporcao_ipanema: number | null
          tipo: string
          vigente_ate: string | null
          vigente_desde: string
        }
        Insert: {
          colaborador_id: string
          created_at?: string
          data_base?: string | null
          dias_ipanema?: number[] | null
          distribuicao?: string | null
          folga_semana_a?: number | null
          folga_semana_b?: number | null
          folgas_fixas?: number[]
          hora_entrada?: string | null
          hora_saida?: string | null
          id?: string
          intervalo_minutos?: number | null
          proporcao_botafogo?: number | null
          proporcao_ipanema?: number | null
          tipo: string
          vigente_ate?: string | null
          vigente_desde?: string
        }
        Update: {
          colaborador_id?: string
          created_at?: string
          data_base?: string | null
          dias_ipanema?: number[] | null
          distribuicao?: string | null
          folga_semana_a?: number | null
          folga_semana_b?: number | null
          folgas_fixas?: number[]
          hora_entrada?: string | null
          hora_saida?: string | null
          id?: string
          intervalo_minutos?: number | null
          proporcao_botafogo?: number | null
          proporcao_ipanema?: number | null
          tipo?: string
          vigente_ate?: string | null
          vigente_desde?: string
        }
        Relationships: [
          {
            foreignKeyName: "escala_padroes_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "escala_colaboradores"
            referencedColumns: ["id"]
          },
        ]
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
      feriados: {
        Row: {
          abrangencia: string
          created_at: string
          data: string
          id: string
          nome: string
        }
        Insert: {
          abrangencia: string
          created_at?: string
          data: string
          id?: string
          nome: string
        }
        Update: {
          abrangencia?: string
          created_at?: string
          data?: string
          id?: string
          nome?: string
        }
        Relationships: []
      }
      fin_categorias: {
        Row: {
          ativo: boolean
          created_at: string
          grupo: string
          id: string
          nome: string
          ordem: number
          tipo: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          grupo: string
          id?: string
          nome: string
          ordem?: number
          tipo: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          grupo?: string
          id?: string
          nome?: string
          ordem?: number
          tipo?: string
        }
        Relationships: []
      }
      fin_config: {
        Row: {
          id: number
          rateio_botafogo_pct: number
          rateio_ipanema_pct: number
          updated_at: string
        }
        Insert: {
          id?: number
          rateio_botafogo_pct?: number
          rateio_ipanema_pct?: number
          updated_at?: string
        }
        Update: {
          id?: number
          rateio_botafogo_pct?: number
          rateio_ipanema_pct?: number
          updated_at?: string
        }
        Relationships: []
      }
      fin_fornecedores: {
        Row: {
          ativo: boolean
          categoria_padrao_id: string | null
          chave_pix: string | null
          cnpj_cpf: string | null
          contato: string | null
          created_at: string
          id: string
          nome: string
          observacoes: string | null
          telefone: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          categoria_padrao_id?: string | null
          chave_pix?: string | null
          cnpj_cpf?: string | null
          contato?: string | null
          created_at?: string
          id?: string
          nome: string
          observacoes?: string | null
          telefone?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          categoria_padrao_id?: string | null
          chave_pix?: string | null
          cnpj_cpf?: string | null
          contato?: string | null
          created_at?: string
          id?: string
          nome?: string
          observacoes?: string | null
          telefone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fin_fornecedores_categoria_padrao_id_fkey"
            columns: ["categoria_padrao_id"]
            isOneToOne: false
            referencedRelation: "fin_categorias"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_indicadores_mes: {
        Row: {
          competencia: string
          created_at: string
          created_by: string
          diarias_vendidas: number
          id: string
          observacoes: string | null
          ocupacao_pct: number
          receita_hospedagem: number
          unidade: string
          updated_at: string
        }
        Insert: {
          competencia: string
          created_at?: string
          created_by?: string
          diarias_vendidas?: number
          id?: string
          observacoes?: string | null
          ocupacao_pct?: number
          receita_hospedagem?: number
          unidade: string
          updated_at?: string
        }
        Update: {
          competencia?: string
          created_at?: string
          created_by?: string
          diarias_vendidas?: number
          id?: string
          observacoes?: string | null
          ocupacao_pct?: number
          receita_hospedagem?: number
          unidade?: string
          updated_at?: string
        }
        Relationships: []
      }
      fin_lancamentos: {
        Row: {
          anexo_path: string | null
          ativo_descricao: string | null
          categoria_id: string
          competencia: string
          consumo_quantidade: number | null
          consumo_unidade: string | null
          created_at: string
          created_by: string
          data_pagamento: string | null
          data_vencimento: string | null
          descricao: string
          forma_pagamento: string | null
          fornecedor_id: string | null
          freelancer_nome: string | null
          funcionario_id: string | null
          id: string
          numero_documento: string | null
          observacoes: string | null
          origem_escala: string | null
          qtd_diarias: number | null
          recorrencia_id: string | null
          recorrencia_modelo_id: string | null
          status: string
          tipo: string
          unidade: string
          updated_at: string
          valor: number
        }
        Insert: {
          anexo_path?: string | null
          ativo_descricao?: string | null
          categoria_id: string
          competencia: string
          consumo_quantidade?: number | null
          consumo_unidade?: string | null
          created_at?: string
          created_by?: string
          data_pagamento?: string | null
          data_vencimento?: string | null
          descricao: string
          forma_pagamento?: string | null
          fornecedor_id?: string | null
          freelancer_nome?: string | null
          funcionario_id?: string | null
          id?: string
          numero_documento?: string | null
          observacoes?: string | null
          origem_escala?: string | null
          qtd_diarias?: number | null
          recorrencia_id?: string | null
          recorrencia_modelo_id?: string | null
          status?: string
          tipo: string
          unidade: string
          updated_at?: string
          valor: number
        }
        Update: {
          anexo_path?: string | null
          ativo_descricao?: string | null
          categoria_id?: string
          competencia?: string
          consumo_quantidade?: number | null
          consumo_unidade?: string | null
          created_at?: string
          created_by?: string
          data_pagamento?: string | null
          data_vencimento?: string | null
          descricao?: string
          forma_pagamento?: string | null
          fornecedor_id?: string | null
          freelancer_nome?: string | null
          funcionario_id?: string | null
          id?: string
          numero_documento?: string | null
          observacoes?: string | null
          origem_escala?: string | null
          qtd_diarias?: number | null
          recorrencia_id?: string | null
          recorrencia_modelo_id?: string | null
          status?: string
          tipo?: string
          unidade?: string
          updated_at?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "fin_lancamentos_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "fin_categorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_lancamentos_fornecedor_id_fkey"
            columns: ["fornecedor_id"]
            isOneToOne: false
            referencedRelation: "fin_fornecedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_lancamentos_funcionario_id_fkey"
            columns: ["funcionario_id"]
            isOneToOne: false
            referencedRelation: "funcionarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_lancamentos_recorrencia_id_fkey"
            columns: ["recorrencia_id"]
            isOneToOne: false
            referencedRelation: "escala_alertas_financeiros"
            referencedColumns: ["lancamento_id"]
          },
          {
            foreignKeyName: "fin_lancamentos_recorrencia_id_fkey"
            columns: ["recorrencia_id"]
            isOneToOne: false
            referencedRelation: "fin_lancamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_lancamentos_recorrencia_modelo_id_fkey"
            columns: ["recorrencia_modelo_id"]
            isOneToOne: false
            referencedRelation: "fin_recorrencias"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_recorrencias: {
        Row: {
          ativo: boolean
          categoria_id: string
          created_at: string
          created_by: string
          descricao: string
          dia_vencimento: number
          forma_pagamento: string | null
          fornecedor_id: string | null
          id: string
          tipo: string
          unidade: string
          updated_at: string
          valor_previsto: number
          valor_variavel: boolean
        }
        Insert: {
          ativo?: boolean
          categoria_id: string
          created_at?: string
          created_by?: string
          descricao: string
          dia_vencimento: number
          forma_pagamento?: string | null
          fornecedor_id?: string | null
          id?: string
          tipo: string
          unidade: string
          updated_at?: string
          valor_previsto: number
          valor_variavel?: boolean
        }
        Update: {
          ativo?: boolean
          categoria_id?: string
          created_at?: string
          created_by?: string
          descricao?: string
          dia_vencimento?: number
          forma_pagamento?: string | null
          fornecedor_id?: string | null
          id?: string
          tipo?: string
          unidade?: string
          updated_at?: string
          valor_previsto?: number
          valor_variavel?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "fin_recorrencias_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "fin_categorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_recorrencias_fornecedor_id_fkey"
            columns: ["fornecedor_id"]
            isOneToOne: false
            referencedRelation: "fin_fornecedores"
            referencedColumns: ["id"]
          },
        ]
      }
      funcionarios: {
        Row: {
          categorias: string[]
          cpf: string | null
          created_at: string
          email: string
          id: string
          nome: string
          pontomais_employee_id: string | null
          telas_permitidas: string[] | null
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
          pontomais_employee_id?: string | null
          telas_permitidas?: string[] | null
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
          pontomais_employee_id?: string | null
          telas_permitidas?: string[] | null
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
      inventory_movements: {
        Row: {
          created_at: string
          destination: string | null
          id: string
          item_id: string | null
          item_name: string
          movement_type: string
          notes: string | null
          performed_by: string | null
          performed_by_user_id: string | null
          property: string
          quantity: number
          sector: string | null
          source: string | null
          unit_type: string | null
        }
        Insert: {
          created_at?: string
          destination?: string | null
          id?: string
          item_id?: string | null
          item_name: string
          movement_type: string
          notes?: string | null
          performed_by?: string | null
          performed_by_user_id?: string | null
          property: string
          quantity: number
          sector?: string | null
          source?: string | null
          unit_type?: string | null
        }
        Update: {
          created_at?: string
          destination?: string | null
          id?: string
          item_id?: string | null
          item_name?: string
          movement_type?: string
          notes?: string | null
          performed_by?: string | null
          performed_by_user_id?: string | null
          property?: string
          quantity?: number
          sector?: string | null
          source?: string | null
          unit_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
        ]
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
      ponto_batidas: {
        Row: {
          colaborador_id: string
          created_at: string
          data_ref: string
          dentro_raio: boolean | null
          device_id: string | null
          device_ok: boolean | null
          distancia_m: number | null
          face_distancia: number | null
          face_ok: boolean | null
          id: string
          latitude: number | null
          longitude: number | null
          motivos: string[]
          observacao: string | null
          origem: string
          precisao_m: number | null
          registrado_em: string
          registrado_por: string | null
          revisado_em: string | null
          revisado_por: string | null
          selfie_path: string | null
          status: string
          tipo: string
          unidade: string
          vivacidade_ok: boolean | null
        }
        Insert: {
          colaborador_id: string
          created_at?: string
          data_ref: string
          dentro_raio?: boolean | null
          device_id?: string | null
          device_ok?: boolean | null
          distancia_m?: number | null
          face_distancia?: number | null
          face_ok?: boolean | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          motivos?: string[]
          observacao?: string | null
          origem?: string
          precisao_m?: number | null
          registrado_em?: string
          registrado_por?: string | null
          revisado_em?: string | null
          revisado_por?: string | null
          selfie_path?: string | null
          status: string
          tipo: string
          unidade: string
          vivacidade_ok?: boolean | null
        }
        Update: {
          colaborador_id?: string
          created_at?: string
          data_ref?: string
          dentro_raio?: boolean | null
          device_id?: string | null
          device_ok?: boolean | null
          distancia_m?: number | null
          face_distancia?: number | null
          face_ok?: boolean | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          motivos?: string[]
          observacao?: string | null
          origem?: string
          precisao_m?: number | null
          registrado_em?: string
          registrado_por?: string | null
          revisado_em?: string | null
          revisado_por?: string | null
          selfie_path?: string | null
          status?: string
          tipo?: string
          unidade?: string
          vivacidade_ok?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "ponto_batidas_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "escala_colaboradores"
            referencedColumns: ["id"]
          },
        ]
      }
      ponto_biometria: {
        Row: {
          cadastrado_por: string | null
          colaborador_id: string
          consentimento_em: string
          consentimento_versao: string
          created_at: string
          descritores: Json
          device_id: string | null
          updated_at: string
        }
        Insert: {
          cadastrado_por?: string | null
          colaborador_id: string
          consentimento_em: string
          consentimento_versao: string
          created_at?: string
          descritores: Json
          device_id?: string | null
          updated_at?: string
        }
        Update: {
          cadastrado_por?: string | null
          colaborador_id?: string
          consentimento_em?: string
          consentimento_versao?: string
          created_at?: string
          descritores?: Json
          device_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ponto_biometria_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: true
            referencedRelation: "escala_colaboradores"
            referencedColumns: ["id"]
          },
        ]
      }
      ponto_config: {
        Row: {
          latitude: number | null
          limiar_face: number
          longitude: number | null
          raio_m: number
          tolerancia_min: number
          unidade: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          latitude?: number | null
          limiar_face?: number
          longitude?: number | null
          raio_m?: number
          tolerancia_min?: number
          unidade: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          latitude?: number | null
          limiar_face?: number
          longitude?: number | null
          raio_m?: number
          tolerancia_min?: number
          unidade?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      preventive_logs: {
        Row: {
          category: string
          completed_at: string
          created_at: string
          frequency_days: number
          id: string
          location_name: string
          midias: Json
          next_due_date: string | null
          notes: string | null
          property: string
          task_id: string
          technician_name: string
          technician_user_id: string | null
        }
        Insert: {
          category: string
          completed_at?: string
          created_at?: string
          frequency_days: number
          id?: string
          location_name: string
          midias?: Json
          next_due_date?: string | null
          notes?: string | null
          property: string
          task_id: string
          technician_name: string
          technician_user_id?: string | null
        }
        Update: {
          category?: string
          completed_at?: string
          created_at?: string
          frequency_days?: number
          id?: string
          location_name?: string
          midias?: Json
          next_due_date?: string | null
          notes?: string | null
          property?: string
          task_id?: string
          technician_name?: string
          technician_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "preventive_logs_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "preventive_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      preventive_tasks: {
        Row: {
          active: boolean
          category: string
          created_at: string
          discipline: string | null
          frequency_days: number
          id: string
          property: string | null
          task_name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          category: string
          created_at?: string
          discipline?: string | null
          frequency_days: number
          id?: string
          property?: string | null
          task_name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          category?: string
          created_at?: string
          discipline?: string | null
          frequency_days?: number
          id?: string
          property?: string | null
          task_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      previsao_carga: {
        Row: {
          calculado_em: string
          camareiras_escaladas: number
          capacidade_detalhes: Json
          capacidade_minutos: number
          carga_minutos: number
          chegada_mais_cedo: string | null
          data: string
          detalhes: Json
          freelancers_escalados: number
          horizonte_dias: number
          id: string
          nivel: string
          ocupacao_carga_pct: number
          qtd_arrumacao: number
          qtd_checkins: number
          qtd_checkouts: number
          qtd_geral: number
          qtd_geral_checkin: number
          qtd_troca_arrumacao: number
          unidade: string
        }
        Insert: {
          calculado_em?: string
          camareiras_escaladas?: number
          capacidade_detalhes?: Json
          capacidade_minutos?: number
          carga_minutos?: number
          chegada_mais_cedo?: string | null
          data: string
          detalhes?: Json
          freelancers_escalados?: number
          horizonte_dias: number
          id?: string
          nivel: string
          ocupacao_carga_pct?: number
          qtd_arrumacao?: number
          qtd_checkins?: number
          qtd_checkouts?: number
          qtd_geral?: number
          qtd_geral_checkin?: number
          qtd_troca_arrumacao?: number
          unidade: string
        }
        Update: {
          calculado_em?: string
          camareiras_escaladas?: number
          capacidade_detalhes?: Json
          capacidade_minutos?: number
          carga_minutos?: number
          chegada_mais_cedo?: string | null
          data?: string
          detalhes?: Json
          freelancers_escalados?: number
          horizonte_dias?: number
          id?: string
          nivel?: string
          ocupacao_carga_pct?: number
          qtd_arrumacao?: number
          qtd_checkins?: number
          qtd_checkouts?: number
          qtd_geral?: number
          qtd_geral_checkin?: number
          qtd_troca_arrumacao?: number
          unidade?: string
        }
        Relationships: []
      }
      previsao_carga_alertas: {
        Row: {
          data: string
          enviado_em: string
          id: string
          nivel: string
          previsao_id: string
          tipo: string
          unidade: string
        }
        Insert: {
          data: string
          enviado_em?: string
          id?: string
          nivel: string
          previsao_id: string
          tipo: string
          unidade: string
        }
        Update: {
          data?: string
          enviado_em?: string
          id?: string
          nivel?: string
          previsao_id?: string
          tipo?: string
          unidade?: string
        }
        Relationships: [
          {
            foreignKeyName: "previsao_carga_alertas_previsao_id_fkey"
            columns: ["previsao_id"]
            isOneToOne: false
            referencedRelation: "previsao_carga"
            referencedColumns: ["id"]
          },
        ]
      }
      previsao_carga_config: {
        Row: {
          arrumacao_minutos: number
          geral_checkin_minutos: number
          geral_minutos: number
          limite_amarelo_gerais: number
          limite_amarelo_pct: number
          limite_vermelho_gerais: number
          limite_vermelho_pct: number
          margem_pct: number
          troca_arrumacao_minutos: number
          unidade: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          arrumacao_minutos?: number
          geral_checkin_minutos?: number
          geral_minutos?: number
          limite_amarelo_gerais: number
          limite_amarelo_pct?: number
          limite_vermelho_gerais: number
          limite_vermelho_pct?: number
          margem_pct?: number
          troca_arrumacao_minutos?: number
          unidade: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          arrumacao_minutos?: number
          geral_checkin_minutos?: number
          geral_minutos?: number
          limite_amarelo_gerais?: number
          limite_amarelo_pct?: number
          limite_vermelho_gerais?: number
          limite_vermelho_pct?: number
          margem_pct?: number
          troca_arrumacao_minutos?: number
          unidade?: string
          updated_at?: string
          updated_by?: string | null
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
      push_subscriptions: {
        Row: {
          auth_key: string
          created_at: string
          endpoint: string
          id: string
          last_used_at: string
          p256dh: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth_key: string
          created_at?: string
          endpoint: string
          id?: string
          last_used_at?: string
          p256dh: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth_key?: string
          created_at?: string
          endpoint?: string
          id?: string
          last_used_at?: string
          p256dh?: string
          user_agent?: string | null
          user_id?: string
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
      recepcao_caixa_movimentos: {
        Row: {
          amount: number
          created_at: string
          id: string
          performed_by: string
          property: Database["public"]["Enums"]["unidade"]
          reason: string
          type: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          performed_by: string
          property: Database["public"]["Enums"]["unidade"]
          reason: string
          type: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          performed_by?: string
          property?: Database["public"]["Enums"]["unidade"]
          reason?: string
          type?: string
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
          avaliacao_id: string | null
          created_at: string
          criado_por: string | null
          data: string
          id: string
          nome_hospede: string
          nota_funcionarios: number
          nota_geral: number
          nota_limpeza: number | null
          observacao: string | null
          setor: string
          teve_elogio: boolean
          unidade: string
          updated_at: string
          valor_calculado: number
        }
        Insert: {
          avaliacao_id?: string | null
          created_at?: string
          criado_por?: string | null
          data?: string
          id?: string
          nome_hospede: string
          nota_funcionarios: number
          nota_geral: number
          nota_limpeza?: number | null
          observacao?: string | null
          setor?: string
          teve_elogio?: boolean
          unidade: string
          updated_at?: string
          valor_calculado?: number
        }
        Update: {
          avaliacao_id?: string | null
          created_at?: string
          criado_por?: string | null
          data?: string
          id?: string
          nome_hospede?: string
          nota_funcionarios?: number
          nota_geral?: number
          nota_limpeza?: number | null
          observacao?: string | null
          setor?: string
          teve_elogio?: boolean
          unidade?: string
          updated_at?: string
          valor_calculado?: number
        }
        Relationships: []
      }
      reservation_payments: {
        Row: {
          amount: number
          cloudbeds_response: Json | null
          created_at: string
          guest_name: string
          id: string
          payment_method: string
          property: string
          received_by: string
          received_by_user_id: string | null
          reservation_id: string
        }
        Insert: {
          amount: number
          cloudbeds_response?: Json | null
          created_at?: string
          guest_name: string
          id?: string
          payment_method: string
          property: string
          received_by: string
          received_by_user_id?: string | null
          reservation_id: string
        }
        Update: {
          amount?: number
          cloudbeds_response?: Json | null
          created_at?: string
          guest_name?: string
          id?: string
          payment_method?: string
          property?: string
          received_by?: string
          received_by_user_id?: string | null
          reservation_id?: string
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
          comment_media_type: string | null
          comment_media_url: string | null
          condition: string | null
          departing_guest_name: string | null
          dnd_photo_url: string | null
          eci_time: string | null
          guest_name: string | null
          has_eci: boolean
          has_lco: boolean
          has_pending_docs: boolean | null
          has_pending_payment: boolean | null
          id: string
          is_dnd: boolean
          lco_time: string | null
          next_arrival_time: string | null
          next_guest_name: string | null
          next_pax: number | null
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
          comment_media_type?: string | null
          comment_media_url?: string | null
          condition?: string | null
          departing_guest_name?: string | null
          dnd_photo_url?: string | null
          eci_time?: string | null
          guest_name?: string | null
          has_eci?: boolean
          has_lco?: boolean
          has_pending_docs?: boolean | null
          has_pending_payment?: boolean | null
          id?: string
          is_dnd?: boolean
          lco_time?: string | null
          next_arrival_time?: string | null
          next_guest_name?: string | null
          next_pax?: number | null
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
          comment_media_type?: string | null
          comment_media_url?: string | null
          condition?: string | null
          departing_guest_name?: string | null
          dnd_photo_url?: string | null
          eci_time?: string | null
          guest_name?: string | null
          has_eci?: boolean
          has_lco?: boolean
          has_pending_docs?: boolean | null
          has_pending_payment?: boolean | null
          id?: string
          is_dnd?: boolean
          lco_time?: string | null
          next_arrival_time?: string | null
          next_guest_name?: string | null
          next_pax?: number | null
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
          media_type: string | null
          media_url: string | null
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
          media_type?: string | null
          media_url?: string | null
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
          media_type?: string | null
          media_url?: string | null
          photo_url?: string | null
          property?: string
          room_number?: string
          started_at?: string | null
          task_name?: string
        }
        Relationships: []
      }
      room_inspection_issues: {
        Row: {
          chamado_id: string | null
          created_at: string
          description: string
          id: string
          opened_by: string
          opened_by_name: string
          property: string
          recado_id: string | null
          resolved_at: string | null
          resolved_by: string | null
          resolved_by_name: string | null
          responsible_id: string | null
          responsible_name: string
          room_number: string
          status: string
          team: string
          updated_at: string
        }
        Insert: {
          chamado_id?: string | null
          created_at?: string
          description: string
          id?: string
          opened_by: string
          opened_by_name: string
          property: string
          recado_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          resolved_by_name?: string | null
          responsible_id?: string | null
          responsible_name: string
          room_number: string
          status?: string
          team: string
          updated_at?: string
        }
        Update: {
          chamado_id?: string | null
          created_at?: string
          description?: string
          id?: string
          opened_by?: string
          opened_by_name?: string
          property?: string
          recado_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          resolved_by_name?: string | null
          responsible_id?: string | null
          responsible_name?: string
          room_number?: string
          status?: string
          team?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_inspection_issues_chamado_id_fkey"
            columns: ["chamado_id"]
            isOneToOne: false
            referencedRelation: "chamados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_inspection_issues_recado_id_fkey"
            columns: ["recado_id"]
            isOneToOne: false
            referencedRelation: "recados_camareiras"
            referencedColumns: ["id"]
          },
        ]
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
      tarefas_extras_agenda: {
        Row: {
          categoria: string
          definido_em: string
          definido_por: string | null
          proxima_data: string
          unidade: string
        }
        Insert: {
          categoria: string
          definido_em?: string
          definido_por?: string | null
          proxima_data: string
          unidade: string
        }
        Update: {
          categoria?: string
          definido_em?: string
          definido_por?: string | null
          proxima_data?: string
          unidade?: string
        }
        Relationships: []
      }
      totem_avaliacoes: {
        Row: {
          comentario: string | null
          criado_em: string
          hospede: string | null
          id: string
          nota: number
          quarto: string | null
          reservation_id: string
          totem_id: string | null
          unidade: string
        }
        Insert: {
          comentario?: string | null
          criado_em?: string
          hospede?: string | null
          id?: string
          nota: number
          quarto?: string | null
          reservation_id: string
          totem_id?: string | null
          unidade: string
        }
        Update: {
          comentario?: string | null
          criado_em?: string
          hospede?: string | null
          id?: string
          nota?: number
          quarto?: string | null
          reservation_id?: string
          totem_id?: string | null
          unidade?: string
        }
        Relationships: [
          {
            foreignKeyName: "totem_avaliacoes_totem_id_fkey"
            columns: ["totem_id"]
            isOneToOne: false
            referencedRelation: "totem_dispositivos"
            referencedColumns: ["id"]
          },
        ]
      }
      totem_dispositivos: {
        Row: {
          ativo: boolean
          bloqueia_saldo_aberto: boolean
          criado_em: string
          criado_por: string | null
          exige_quarto_limpo: boolean
          hora_checkin: string
          hora_checkout: string
          id: string
          modo: string
          nome: string
          pareado_em: string | null
          pareamento_expira: string | null
          pareamento_hash: string | null
          telefone_suporte: string | null
          token_hash: string | null
          ultimo_uso: string | null
          unidade: string
        }
        Insert: {
          ativo?: boolean
          bloqueia_saldo_aberto?: boolean
          criado_em?: string
          criado_por?: string | null
          exige_quarto_limpo?: boolean
          hora_checkin?: string
          hora_checkout?: string
          id?: string
          modo?: string
          nome: string
          pareado_em?: string | null
          pareamento_expira?: string | null
          pareamento_hash?: string | null
          telefone_suporte?: string | null
          token_hash?: string | null
          ultimo_uso?: string | null
          unidade: string
        }
        Update: {
          ativo?: boolean
          bloqueia_saldo_aberto?: boolean
          criado_em?: string
          criado_por?: string | null
          exige_quarto_limpo?: boolean
          hora_checkin?: string
          hora_checkout?: string
          id?: string
          modo?: string
          nome?: string
          pareado_em?: string | null
          pareamento_expira?: string | null
          pareamento_hash?: string | null
          telefone_suporte?: string | null
          token_hash?: string | null
          ultimo_uso?: string | null
          unidade?: string
        }
        Relationships: []
      }
      totem_eventos: {
        Row: {
          criado_em: string
          detalhe: string | null
          hospede: string | null
          id: string
          quarto: string | null
          reservation_id: string | null
          tipo: string
          totem_id: string | null
          unidade: string | null
        }
        Insert: {
          criado_em?: string
          detalhe?: string | null
          hospede?: string | null
          id?: string
          quarto?: string | null
          reservation_id?: string | null
          tipo: string
          totem_id?: string | null
          unidade?: string | null
        }
        Update: {
          criado_em?: string
          detalhe?: string | null
          hospede?: string | null
          id?: string
          quarto?: string | null
          reservation_id?: string | null
          tipo?: string
          totem_id?: string | null
          unidade?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "totem_eventos_totem_id_fkey"
            columns: ["totem_id"]
            isOneToOne: false
            referencedRelation: "totem_dispositivos"
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
      tuya_api_logs: {
        Row: {
          created_at: string
          device_id: string | null
          endpoint: string
          guest_name: string | null
          id: string
          method: string
          request_payload: Json | null
          response_code: number | null
          response_msg: string | null
          response_payload: Json | null
          room_number: string | null
          success: boolean | null
          unidade: string | null
        }
        Insert: {
          created_at?: string
          device_id?: string | null
          endpoint: string
          guest_name?: string | null
          id?: string
          method: string
          request_payload?: Json | null
          response_code?: number | null
          response_msg?: string | null
          response_payload?: Json | null
          room_number?: string | null
          success?: boolean | null
          unidade?: string | null
        }
        Update: {
          created_at?: string
          device_id?: string | null
          endpoint?: string
          guest_name?: string | null
          id?: string
          method?: string
          request_payload?: Json | null
          response_code?: number | null
          response_msg?: string | null
          response_payload?: Json | null
          room_number?: string | null
          success?: boolean | null
          unidade?: string | null
        }
        Relationships: []
      }
      tuya_devices: {
        Row: {
          ativo: boolean
          created_at: string
          device_id: string
          id: string
          label: string
          room_number: string | null
          senha_fixa: string | null
          tipo: string
          unidade: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          device_id: string
          id?: string
          label: string
          room_number?: string | null
          senha_fixa?: string | null
          tipo: string
          unidade: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          device_id?: string
          id?: string
          label?: string
          room_number?: string | null
          senha_fixa?: string | null
          tipo?: string
          unidade?: string
          updated_at?: string
        }
        Relationships: []
      }
      tuya_password_logs: {
        Row: {
          created_at: string
          device_ids: string[]
          entrada: string
          generated_by_name: string | null
          generated_by_user_id: string | null
          guest_name: string
          id: string
          password: string
          reservation_id: string | null
          revoke_reason: string | null
          revoked_at: string | null
          revoked_by_name: string | null
          room_number: string
          saida: string
          senha_ids: Json
          unidade: string | null
        }
        Insert: {
          created_at?: string
          device_ids?: string[]
          entrada: string
          generated_by_name?: string | null
          generated_by_user_id?: string | null
          guest_name: string
          id?: string
          password: string
          reservation_id?: string | null
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by_name?: string | null
          room_number: string
          saida: string
          senha_ids?: Json
          unidade?: string | null
        }
        Update: {
          created_at?: string
          device_ids?: string[]
          entrada?: string
          generated_by_name?: string | null
          generated_by_user_id?: string | null
          guest_name?: string
          id?: string
          password?: string
          reservation_id?: string | null
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by_name?: string | null
          room_number?: string
          saida?: string
          senha_ids?: Json
          unidade?: string | null
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
      escala_alertas_financeiros: {
        Row: {
          colaborador_id: string | null
          competencia: string | null
          divergencia_pago: boolean | null
          faltas_descobertas: number | null
          lancamento_id: string | null
          lancamento_status: string | null
          nome: string | null
          qtd: number | null
          sem_valor: number | null
          total: number | null
          unidade: string | null
          valor_lancamento: number | null
        }
        Relationships: [
          {
            foreignKeyName: "escala_dias_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "escala_colaboradores"
            referencedColumns: ["id"]
          },
        ]
      }
      escala_prevista_dia: {
        Row: {
          colaborador_id: string | null
          data: string | null
          funcionario_id: string | null
          hora_entrada: string | null
          hora_saida: string | null
          status: string | null
          turno: string | null
          unidade: string | null
        }
        Relationships: [
          {
            foreignKeyName: "escala_colaboradores_funcionario_id_fkey"
            columns: ["funcionario_id"]
            isOneToOne: false
            referencedRelation: "funcionarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escala_dias_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "escala_colaboradores"
            referencedColumns: ["id"]
          },
        ]
      }
      ponto_dia: {
        Row: {
          almoco_saida: string | null
          almoco_sem_volta: boolean | null
          almoco_volta: string | null
          apos_horario_min: number | null
          atraso_min: number | null
          batidas_pendentes: number | null
          colaborador_id: string | null
          data: string | null
          entrada_prevista: string | null
          entrada_real: string | null
          falta_sem_registro: boolean | null
          feriado: boolean | null
          intervalo_curto: boolean | null
          intervalo_min: number | null
          intervalo_previsto_min: number | null
          minutos_previstos: number | null
          minutos_trabalhados: number | null
          nome: string | null
          saida_antecipada_min: number | null
          saida_prevista: string | null
          saida_real: string | null
          sem_intervalo: boolean | null
          sem_saida: boolean | null
          setor: string | null
          status_escala: string | null
          tem_lancamento_manual: boolean | null
          trabalhou_fora_da_escala: boolean | null
          turno: string | null
          unidade: string | null
          vinculo: string | null
        }
        Relationships: []
      }
      previsao_tempos_medianos: {
        Row: {
          amostras: number | null
          mediana_minutos: number | null
          tarefa: string | null
          unidade: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      adjust_preventive_log_date: {
        Args: { _log_id: string; _new_date: string }
        Returns: {
          completed_at: string
          id: string
          next_due_date: string
        }[]
      }
      bonificacao_acessos_listar: {
        Args: never
        Returns: {
          email: string
          gestor: boolean
          liberado: boolean
          nome: string
          papeis: string[]
          pode_editar: boolean
          pode_excluir: boolean
          user_id: string
        }[]
      }
      bonificacao_definir_acesso: {
        Args: {
          _liberado: boolean
          _pode_editar: boolean
          _pode_excluir: boolean
          _user_id: string
        }
        Returns: undefined
      }
      bonus_meta_apurar: { Args: { _mes?: string }; Returns: number }
      bonus_meta_excluir_ocorrencia: {
        Args: { _ocorrencia_id: string }
        Returns: undefined
      }
      bonus_meta_justificar: {
        Args: { _justificada: boolean; _motivo: string; _ocorrencia_id: string }
        Returns: undefined
      }
      bonus_meta_lancar: {
        Args: {
          _data: string
          _funcionario_id: string
          _minutos: number
          _motivo: string
          _tipo: string
        }
        Returns: undefined
      }
      bonus_meta_preparar: { Args: never; Returns: undefined }
      bonus_meta_remover_participante: {
        Args: { _funcionario_id: string }
        Returns: undefined
      }
      bonus_meta_salvar_config: {
        Args: {
          _ativo: boolean
          _max_atrasos: number
          _nota: number
          _tolerancia: number
          _valor: number
        }
        Returns: undefined
      }
      bonus_meta_salvar_participante: {
        Args: {
          _ativo: boolean
          _funcionario_id: string
          _setor: string
          _unidade: string
        }
        Returns: undefined
      }
      bonus_meta_situacao: { Args: { _mes?: string }; Returns: Json }
      chat_contacts: {
        Args: never
        Returns: {
          id: string
          nome: string
        }[]
      }
      editar_bonificacao_conjunta: {
        Args: {
          _data: string
          _nome_hospede: string
          _nota_funcionarios: number
          _nota_geral: number
          _nota_limpeza: number
          _observacao_limpeza: string
          _observacao_recepcao: string
          _registro_id: string
          _teve_elogio: boolean
          _unidade: string
        }
        Returns: undefined
      }
      escala_publicar_mes:
        | {
            Args: { _competencia: string; _setor: string; _unidade: string }
            Returns: undefined
          }
        | {
            Args: {
              _competencia: string
              _justificativa?: string
              _setor: string
              _unidade: string
            }
            Returns: undefined
          }
      escala_regenerar_mes: {
        Args: {
          _competencia: string
          _dias: Json
          _setor: string
          _unidade: string
        }
        Returns: number
      }
      escala_sincronizar_financeiro: {
        Args: { _competencia: string; _unidade: string }
        Returns: number
      }
      fin_gerar_mes: { Args: { _competencia: string }; Returns: number }
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
      list_staff_basic: {
        Args: never
        Returns: {
          categorias: string[]
          email: string
          id: string
          nome: string
          telas_permitidas: string[]
          user_id: string
        }[]
      }
      list_tecnicos: {
        Args: never
        Returns: {
          categorias: string[]
          id: string
          nome: string
        }[]
      }
      minha_escala_publicada: {
        Args: { _fim: string; _inicio: string }
        Returns: {
          data: string
          hora_entrada: string
          hora_saida: string
          id: string
          motivo: string
          publicada_em: string
          setor: string
          status: string
          turno: string
          unidade: string
        }[]
      }
      minha_permissao_bonificacao: { Args: never; Returns: Json }
      open_room_inspection_issue: {
        Args: {
          _category?: string
          _description: string
          _property: string
          _responsible_id?: string
          _room_number: string
          _team: string
        }
        Returns: string
      }
      ponto_cadastrar_biometria: {
        Args: {
          _colaborador_id: string
          _consentimento: boolean
          _consentimento_versao: string
          _descritores: Json
          _device_id: string
        }
        Returns: undefined
      }
      ponto_freelancers_quiosque: {
        Args: { _unidade: string }
        Returns: {
          cadastro_facial: boolean
          colaborador_id: string
          entrada_aberta: boolean
          nome: string
        }[]
      }
      ponto_lancar_manual: {
        Args: {
          _colaborador_id: string
          _motivo: string
          _registrado_em: string
          _tipo: string
          _unidade: string
        }
        Returns: string
      }
      ponto_meu_status: { Args: never; Returns: Json }
      ponto_quiosque_lista: {
        Args: { _unidade: string }
        Returns: {
          cadastro_facial: boolean
          colaborador_id: string
          entrada_aberta: boolean
          nome: string
          proximos_tipos: string[]
          setor: string
          ultimo_tipo: string
          vinculo: string
        }[]
      }
      ponto_registrar: {
        Args: {
          _colaborador_id?: string
          _descritor: Json
          _device_id: string
          _latitude: number
          _longitude: number
          _modo?: string
          _precisao_m: number
          _selfie_path: string
          _tipo?: string
          _vivacidade_ok: boolean
        }
        Returns: Json
      }
      ponto_revisar: {
        Args: { _aprovar: boolean; _batida_id: string; _observacao?: string }
        Returns: undefined
      }
      ponto_vincular_aparelho: {
        Args: { _colaborador_id: string; _device_id: string }
        Returns: undefined
      }
      registrar_bonificacao_conjunta: {
        Args: {
          _data: string
          _nome_hospede: string
          _nota_funcionarios: number
          _nota_geral: number
          _nota_limpeza: number
          _observacao: string
          _teve_elogio: boolean
          _unidade: string
        }
        Returns: undefined
      }
      resolve_room_inspection_issue: {
        Args: { _issue_id: string }
        Returns: undefined
      }
      totem_gerar_pareamento: { Args: { p_totem: string }; Returns: Json }
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
