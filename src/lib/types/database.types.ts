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
      alumnos_precargados: {
        Row: {
          created_at: string | null
          email: string
          empresa_id: string | null
          horario_entrada: string | null
          id: string
        }
        Insert: {
          created_at?: string | null
          email: string
          empresa_id?: string | null
          horario_entrada?: string | null
          id?: string
        }
        Update: {
          created_at?: string | null
          email?: string
          empresa_id?: string | null
          horario_entrada?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "alumnos_precargados_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      alumnos_precargados_dias: {
        Row: {
          dia: string
          id: string
          precargado_id: string
        }
        Insert: {
          dia: string
          id?: string
          precargado_id: string
        }
        Update: {
          dia?: string
          id?: string
          precargado_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "alumnos_precargados_dias_precargado_id_fkey"
            columns: ["precargado_id"]
            isOneToOne: false
            referencedRelation: "alumnos_precargados"
            referencedColumns: ["id"]
          },
        ]
      }
      cursos: {
        Row: {
          created_at: string | null
          id: string
          nombre: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          nombre: string
        }
        Update: {
          created_at?: string | null
          id?: string
          nombre?: string
        }
        Relationships: []
      }
      cursos_horarios: {
        Row: {
          curso_id: string | null
          dia: string
          hora_regreso: string
          id: string
        }
        Insert: {
          curso_id?: string | null
          dia: string
          hora_regreso: string
          id?: string
        }
        Update: {
          curso_id?: string | null
          dia?: string
          hora_regreso?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cursos_horarios_curso_id_fkey"
            columns: ["curso_id"]
            isOneToOne: false
            referencedRelation: "cursos"
            referencedColumns: ["id"]
          },
        ]
      }
      dias_habilitados: {
        Row: {
          created_at: string
          dia: string
          id: string
          perfil_id: string
        }
        Insert: {
          created_at?: string
          dia: string
          id?: string
          perfil_id: string
        }
        Update: {
          created_at?: string
          dia?: string
          id?: string
          perfil_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dias_habilitados_perfil_id_fkey"
            columns: ["perfil_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      empresas: {
        Row: {
          created_at: string
          id: string
          nombre: string
        }
        Insert: {
          created_at?: string
          id?: string
          nombre: string
        }
        Update: {
          created_at?: string
          id?: string
          nombre?: string
        }
        Relationships: []
      }
      movimientos: {
        Row: {
          created_at: string
          fecha: string
          firma_ingreso: string | null
          firma_salida: string
          hora_ingreso: string | null
          hora_salida: string
          id: string
          perfil_id: string
        }
        Insert: {
          created_at?: string
          fecha: string
          firma_ingreso?: string | null
          firma_salida: string
          hora_ingreso?: string | null
          hora_salida: string
          id?: string
          perfil_id: string
        }
        Update: {
          created_at?: string
          fecha?: string
          firma_ingreso?: string | null
          firma_salida?: string
          hora_ingreso?: string | null
          hora_salida?: string
          id?: string
          perfil_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "movimientos_perfil_id_fkey"
            columns: ["perfil_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      perfiles: {
        Row: {
          created_at: string
          curso_id: string | null
          email: string
          empresa_id: string | null
          horario_entrada: string | null
          id: string
          rol: string | null
        }
        Insert: {
          created_at?: string
          curso_id?: string | null
          email: string
          empresa_id?: string | null
          horario_entrada?: string | null
          id: string
          rol?: string | null
        }
        Update: {
          created_at?: string
          curso_id?: string | null
          email?: string
          empresa_id?: string | null
          horario_entrada?: string | null
          id?: string
          rol?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "perfiles_curso_id_fkey"
            columns: ["curso_id"]
            isOneToOne: false
            referencedRelation: "cursos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "perfiles_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      recreativo_items: {
        Row: {
          activo: boolean | null
          creado_en: string | null
          id: string
          nombre: string
        }
        Insert: {
          activo?: boolean | null
          creado_en?: string | null
          id?: string
          nombre: string
        }
        Update: {
          activo?: boolean | null
          creado_en?: string | null
          id?: string
          nombre?: string
        }
        Relationships: []
      }
      recreativo_movimientos: {
        Row: {
          estado_devolucion: string | null
          fecha: string
          hora_devolucion: string | null
          hora_retiro: string
          id: string
          item_id: string
          observaciones: string | null
          perfil_id: string
          preceptor_devolucion_id: string | null
          preceptor_retiro_id: string | null
        }
        Insert: {
          estado_devolucion?: string | null
          fecha?: string
          hora_devolucion?: string | null
          hora_retiro: string
          id?: string
          item_id: string
          observaciones?: string | null
          perfil_id: string
          preceptor_devolucion_id?: string | null
          preceptor_retiro_id?: string | null
        }
        Update: {
          estado_devolucion?: string | null
          fecha?: string
          hora_devolucion?: string | null
          hora_retiro?: string
          id?: string
          item_id?: string
          observaciones?: string | null
          perfil_id?: string
          preceptor_devolucion_id?: string | null
          preceptor_retiro_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recreativo_movimientos_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "recreativo_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recreativo_movimientos_perfil_id_fkey"
            columns: ["perfil_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recreativo_movimientos_preceptor_devolucion_id_fkey"
            columns: ["preceptor_devolucion_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recreativo_movimientos_preceptor_retiro_id_fkey"
            columns: ["preceptor_retiro_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      registros: {
        Row: {
          created_at: string
          fecha: string
          hora_entrada_real: string
          id: string
          perfil_id: string
        }
        Insert: {
          created_at?: string
          fecha: string
          hora_entrada_real: string
          id?: string
          perfil_id: string
        }
        Update: {
          created_at?: string
          fecha?: string
          hora_entrada_real?: string
          id?: string
          perfil_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "registros_perfil_id_fkey"
            columns: ["perfil_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles_precargados: {
        Row: {
          created_at: string
          email: string
          id: string
          rol: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          rol: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          rol?: string
        }
        Relationships: []
      }
      seccion_cursos_permitidos: {
        Row: {
          curso_id: string
          id: string
          seccion: string
        }
        Insert: {
          curso_id: string
          id?: string
          seccion: string
        }
        Update: {
          curso_id?: string
          id?: string
          seccion?: string
        }
        Relationships: [
          {
            foreignKeyName: "seccion_cursos_permitidos_curso_id_fkey"
            columns: ["curso_id"]
            isOneToOne: false
            referencedRelation: "cursos"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      aplicar_precarga_pp: { Args: never; Returns: boolean }
      es_admin: { Args: never; Returns: boolean }
      es_staff: { Args: never; Returns: boolean }
      rol_actual: { Args: never; Returns: string }
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
    Enums: {},
  },
} as const
