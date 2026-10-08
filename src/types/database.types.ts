export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      assessment_attempt_answer_keys: {
        Row: {
          attempt_id: string
          attempt_question_id: string
          correct_option_ids: string[]
        }
        Insert: {
          attempt_id: string
          attempt_question_id: string
          correct_option_ids?: string[]
        }
        Update: {
          attempt_id?: string
          attempt_question_id?: string
          correct_option_ids?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "assessment_attempt_answer_keys_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "assessment_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_attempt_answer_keys_attempt_question_id_fkey"
            columns: ["attempt_question_id"]
            isOneToOne: false
            referencedRelation: "assessment_attempt_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      assessment_attempt_questions: {
        Row: {
          attempt_id: string
          client_seq: number
          created_at: string
          id: string
          options: Json
          points: number
          position: number
          prompt: string
          question_id: string
          saved_at: string | null
          selected_option_id: string | null
          text_answer: string | null
          type: Database["public"]["Enums"]["question_type"]
        }
        Insert: {
          attempt_id: string
          client_seq?: number
          created_at?: string
          id?: string
          options?: Json
          points: number
          position: number
          prompt: string
          question_id: string
          saved_at?: string | null
          selected_option_id?: string | null
          text_answer?: string | null
          type: Database["public"]["Enums"]["question_type"]
        }
        Update: {
          attempt_id?: string
          client_seq?: number
          created_at?: string
          id?: string
          options?: Json
          points?: number
          position?: number
          prompt?: string
          question_id?: string
          saved_at?: string | null
          selected_option_id?: string | null
          text_answer?: string | null
          type?: Database["public"]["Enums"]["question_type"]
        }
        Relationships: [
          {
            foreignKeyName: "assessment_attempt_questions_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "assessment_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_attempt_questions_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      assessment_attempts: {
        Row: {
          active_session_id: string | null
          assessment_id: string
          attempt_number: number
          auto_score: number
          availability_until: string | null
          created_at: string
          duration_seconds: number | null
          effective_end_at: string | null
          enrollment_id: string
          graded_at: string | null
          id: string
          manual_score: number
          max_score: number
          organization_id: string
          passed: boolean | null
          score_label: string | null
          score_percent: number | null
          session_last_seen_at: string | null
          started_at: string
          status: Database["public"]["Enums"]["attempt_status"]
          submitted_at: string | null
          submitted_late: boolean
          total_score: number
          updated_at: string
          user_id: string
        }
        Insert: {
          active_session_id?: string | null
          assessment_id: string
          attempt_number: number
          auto_score?: number
          availability_until?: string | null
          created_at?: string
          duration_seconds?: number | null
          effective_end_at?: string | null
          enrollment_id: string
          graded_at?: string | null
          id?: string
          manual_score?: number
          max_score?: number
          organization_id: string
          passed?: boolean | null
          score_label?: string | null
          score_percent?: number | null
          session_last_seen_at?: string | null
          started_at?: string
          status?: Database["public"]["Enums"]["attempt_status"]
          submitted_at?: string | null
          submitted_late?: boolean
          total_score?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          active_session_id?: string | null
          assessment_id?: string
          attempt_number?: number
          auto_score?: number
          availability_until?: string | null
          created_at?: string
          duration_seconds?: number | null
          effective_end_at?: string | null
          enrollment_id?: string
          graded_at?: string | null
          id?: string
          manual_score?: number
          max_score?: number
          organization_id?: string
          passed?: boolean | null
          score_label?: string | null
          score_percent?: number | null
          session_last_seen_at?: string | null
          started_at?: string
          status?: Database["public"]["Enums"]["attempt_status"]
          submitted_at?: string | null
          submitted_late?: boolean
          total_score?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assessment_attempts_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_attempts_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "course_enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_attempts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_attempts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      assessment_feedback: {
        Row: {
          attempt_id: string
          created_at: string
          feedback: string
          id: string
          professor_id: string | null
          updated_at: string
        }
        Insert: {
          attempt_id: string
          created_at?: string
          feedback: string
          id?: string
          professor_id?: string | null
          updated_at?: string
        }
        Update: {
          attempt_id?: string
          created_at?: string
          feedback?: string
          id?: string
          professor_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assessment_feedback_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: true
            referencedRelation: "assessment_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_feedback_professor_id_fkey"
            columns: ["professor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      assessment_grades: {
        Row: {
          attempt_id: string
          attempt_question_id: string
          feedback: string | null
          graded_at: string
          graded_by: string | null
          id: string
          is_correct: boolean | null
          points_awarded: number
        }
        Insert: {
          attempt_id: string
          attempt_question_id: string
          feedback?: string | null
          graded_at?: string
          graded_by?: string | null
          id?: string
          is_correct?: boolean | null
          points_awarded?: number
        }
        Update: {
          attempt_id?: string
          attempt_question_id?: string
          feedback?: string | null
          graded_at?: string
          graded_by?: string | null
          id?: string
          is_correct?: boolean | null
          points_awarded?: number
        }
        Relationships: [
          {
            foreignKeyName: "assessment_grades_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "assessment_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_grades_attempt_question_id_fkey"
            columns: ["attempt_question_id"]
            isOneToOne: false
            referencedRelation: "assessment_attempt_questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_grades_graded_by_fkey"
            columns: ["graded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      assessment_questions: {
        Row: {
          assessment_id: string
          created_at: string
          id: string
          points: number
          position: number
          question_id: string
        }
        Insert: {
          assessment_id: string
          created_at?: string
          id?: string
          points?: number
          position: number
          question_id: string
        }
        Update: {
          assessment_id?: string
          created_at?: string
          id?: string
          points?: number
          position?: number
          question_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assessment_questions_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_questions_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      assessment_submission_files: {
        Row: {
          attempt_id: string
          created_at: string
          filename: string
          id: string
          mime_type: string
          organization_id: string
          position: number
          size_bytes: number
          storage_path: string
        }
        Insert: {
          attempt_id: string
          created_at?: string
          filename: string
          id?: string
          mime_type: string
          organization_id: string
          position: number
          size_bytes: number
          storage_path: string
        }
        Update: {
          attempt_id?: string
          created_at?: string
          filename?: string
          id?: string
          mime_type?: string
          organization_id?: string
          position?: number
          size_bytes?: number
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "assessment_submission_files_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "assessment_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_submission_files_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      assessments: {
        Row: {
          allow_late_submissions: boolean
          available_from: string | null
          available_until: string | null
          created_at: string
          created_by: string | null
          description: string | null
          duration_seconds: number | null
          id: string
          instructions: string | null
          kind: Database["public"]["Enums"]["assessment_kind"]
          max_attempts: number | null
          max_files: number | null
          module_id: string | null
          offering_id: string
          organization_id: string
          passing_score: number | null
          question_bank_id: string | null
          random_question_count: number | null
          status: Database["public"]["Enums"]["assessment_status"]
          title: string
          updated_at: string
        }
        Insert: {
          allow_late_submissions?: boolean
          available_from?: string | null
          available_until?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          duration_seconds?: number | null
          id?: string
          instructions?: string | null
          kind: Database["public"]["Enums"]["assessment_kind"]
          max_attempts?: number | null
          max_files?: number | null
          module_id?: string | null
          offering_id: string
          organization_id: string
          passing_score?: number | null
          question_bank_id?: string | null
          random_question_count?: number | null
          status?: Database["public"]["Enums"]["assessment_status"]
          title: string
          updated_at?: string
        }
        Update: {
          allow_late_submissions?: boolean
          available_from?: string | null
          available_until?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          duration_seconds?: number | null
          id?: string
          instructions?: string | null
          kind?: Database["public"]["Enums"]["assessment_kind"]
          max_attempts?: number | null
          max_files?: number | null
          module_id?: string | null
          offering_id?: string
          organization_id?: string
          passing_score?: number | null
          question_bank_id?: string | null
          random_question_count?: number | null
          status?: Database["public"]["Enums"]["assessment_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assessments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessments_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "modules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessments_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "course_offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessments_question_bank_id_fkey"
            columns: ["question_bank_id"]
            isOneToOne: false
            referencedRelation: "question_banks"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_user_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: number
          metadata: Json
          organization_id: string | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: never
          metadata?: Json
          organization_id?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: never
          metadata?: Json
          organization_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      content_progress: {
        Row: {
          completed_at: string
          content_block_id: string
          enrollment_id: string
          id: string
        }
        Insert: {
          completed_at?: string
          content_block_id: string
          enrollment_id: string
          id?: string
        }
        Update: {
          completed_at?: string
          content_block_id?: string
          enrollment_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_progress_content_block_id_fkey"
            columns: ["content_block_id"]
            isOneToOne: false
            referencedRelation: "lesson_content_blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_progress_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "course_enrollments"
            referencedColumns: ["id"]
          },
        ]
      }
      course_enrollments: {
        Row: {
          completed_at: string | null
          completed_blocks: number
          course_id: string
          created_at: string
          enrolled_at: string
          id: string
          offering_id: string
          organization_id: string
          progress_percent: number
          source: Database["public"]["Enums"]["enrollment_source"]
          started_at: string | null
          status: Database["public"]["Enums"]["enrollment_status"]
          total_blocks: number
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          completed_blocks?: number
          course_id: string
          created_at?: string
          enrolled_at?: string
          id?: string
          offering_id: string
          organization_id: string
          progress_percent?: number
          source: Database["public"]["Enums"]["enrollment_source"]
          started_at?: string | null
          status?: Database["public"]["Enums"]["enrollment_status"]
          total_blocks?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          completed_blocks?: number
          course_id?: string
          created_at?: string
          enrolled_at?: string
          id?: string
          offering_id?: string
          organization_id?: string
          progress_percent?: number
          source?: Database["public"]["Enums"]["enrollment_source"]
          started_at?: string | null
          status?: Database["public"]["Enums"]["enrollment_status"]
          total_blocks?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_enrollments_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_enrollments_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "course_offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_enrollments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_enrollments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      course_offerings: {
        Row: {
          course_id: string
          created_at: string
          ends_at: string | null
          group_id: string | null
          id: string
          kind: Database["public"]["Enums"]["offering_kind"]
          name: string
          organization_id: string
          starts_at: string | null
          status: Database["public"]["Enums"]["offering_status"]
          updated_at: string
        }
        Insert: {
          course_id: string
          created_at?: string
          ends_at?: string | null
          group_id?: string | null
          id?: string
          kind: Database["public"]["Enums"]["offering_kind"]
          name: string
          organization_id: string
          starts_at?: string | null
          status?: Database["public"]["Enums"]["offering_status"]
          updated_at?: string
        }
        Update: {
          course_id?: string
          created_at?: string
          ends_at?: string | null
          group_id?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["offering_kind"]
          name?: string
          organization_id?: string
          starts_at?: string | null
          status?: Database["public"]["Enums"]["offering_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_offerings_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_offerings_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_offerings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      courses: {
        Row: {
          access_type: Database["public"]["Enums"]["course_access"]
          archived_at: string | null
          cover_image_path: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          organization_id: string
          published_at: string | null
          status: Database["public"]["Enums"]["course_status"]
          title: string
          updated_at: string
        }
        Insert: {
          access_type?: Database["public"]["Enums"]["course_access"]
          archived_at?: string | null
          cover_image_path?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          organization_id: string
          published_at?: string | null
          status?: Database["public"]["Enums"]["course_status"]
          title: string
          updated_at?: string
        }
        Update: {
          access_type?: Database["public"]["Enums"]["course_access"]
          archived_at?: string | null
          cover_image_path?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          organization_id?: string
          published_at?: string | null
          status?: Database["public"]["Enums"]["course_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "courses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "courses_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      group_members: {
        Row: {
          added_at: string
          added_by: string | null
          group_id: string
          id: string
          user_id: string
        }
        Insert: {
          added_at?: string
          added_by?: string | null
          group_id: string
          id?: string
          user_id: string
        }
        Update: {
          added_at?: string
          added_by?: string | null
          group_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_members_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      groups: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "groups_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "groups_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_content_blocks: {
        Row: {
          assessment_id: string | null
          created_at: string
          data: Json
          id: string
          is_required: boolean
          lesson_id: string
          position: number
          type: Database["public"]["Enums"]["content_block_type"]
          updated_at: string
        }
        Insert: {
          assessment_id?: string | null
          created_at?: string
          data?: Json
          id?: string
          is_required?: boolean
          lesson_id: string
          position: number
          type: Database["public"]["Enums"]["content_block_type"]
          updated_at?: string
        }
        Update: {
          assessment_id?: string | null
          created_at?: string
          data?: Json
          id?: string
          is_required?: boolean
          lesson_id?: string
          position?: number
          type?: Database["public"]["Enums"]["content_block_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_content_blocks_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_content_blocks_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      lessons: {
        Row: {
          created_at: string
          description: string | null
          id: string
          module_id: string
          position: number
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          module_id: string
          position: number
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          module_id?: string
          position?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lessons_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "modules"
            referencedColumns: ["id"]
          },
        ]
      }
      module_dependencies: {
        Row: {
          assessment_id: string | null
          condition: Database["public"]["Enums"]["dependency_condition"]
          created_at: string
          depends_on_module_id: string | null
          id: string
          min_score: number | null
          module_id: string
        }
        Insert: {
          assessment_id?: string | null
          condition: Database["public"]["Enums"]["dependency_condition"]
          created_at?: string
          depends_on_module_id?: string | null
          id?: string
          min_score?: number | null
          module_id: string
        }
        Update: {
          assessment_id?: string | null
          condition?: Database["public"]["Enums"]["dependency_condition"]
          created_at?: string
          depends_on_module_id?: string | null
          id?: string
          min_score?: number | null
          module_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "module_dependencies_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "module_dependencies_depends_on_module_id_fkey"
            columns: ["depends_on_module_id"]
            isOneToOne: false
            referencedRelation: "modules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "module_dependencies_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "modules"
            referencedColumns: ["id"]
          },
        ]
      }
      modules: {
        Row: {
          created_at: string
          description: string | null
          id: string
          offering_id: string
          position: number
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          offering_id: string
          position: number
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          offering_id?: string
          position?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "modules_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "course_offerings"
            referencedColumns: ["id"]
          },
        ]
      }
      offering_module_schedules: {
        Row: {
          available_from: string | null
          available_until: string | null
          created_at: string
          id: string
          module_id: string
          offering_id: string
        }
        Insert: {
          available_from?: string | null
          available_until?: string | null
          created_at?: string
          id?: string
          module_id: string
          offering_id: string
        }
        Update: {
          available_from?: string | null
          available_until?: string | null
          created_at?: string
          id?: string
          module_id?: string
          offering_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "offering_module_schedules_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "modules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offering_module_schedules_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "course_offerings"
            referencedColumns: ["id"]
          },
        ]
      }
      offering_professors: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          offering_id: string
          user_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          offering_id: string
          user_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          offering_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "offering_professors_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offering_professors_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "course_offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offering_professors_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_memberships: {
        Row: {
          created_at: string
          id: string
          joined_at: string
          organization_id: string
          role: Database["public"]["Enums"]["membership_role"]
          status: Database["public"]["Enums"]["membership_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          joined_at?: string
          organization_id: string
          role: Database["public"]["Enums"]["membership_role"]
          status?: Database["public"]["Enums"]["membership_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          joined_at?: string
          organization_id?: string
          role?: Database["public"]["Enums"]["membership_role"]
          status?: Database["public"]["Enums"]["membership_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_memberships_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_registration_links: {
        Row: {
          created_at: string
          created_by: string | null
          default_role: Database["public"]["Enums"]["membership_role"]
          expires_at: string | null
          id: string
          is_active: boolean
          label: string | null
          max_uses: number | null
          organization_id: string
          revoked_at: string | null
          token: string
          updated_at: string
          use_count: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          default_role?: Database["public"]["Enums"]["membership_role"]
          expires_at?: string | null
          id?: string
          is_active?: boolean
          label?: string | null
          max_uses?: number | null
          organization_id: string
          revoked_at?: string | null
          token?: string
          updated_at?: string
          use_count?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          default_role?: Database["public"]["Enums"]["membership_role"]
          expires_at?: string | null
          id?: string
          is_active?: boolean
          label?: string | null
          max_uses?: number | null
          organization_id?: string
          revoked_at?: string | null
          token?: string
          updated_at?: string
          use_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "organization_registration_links_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_registration_links_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_settings: {
        Row: {
          created_at: string
          default_passing_score: number
          organization_id: string
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_passing_score?: number
          organization_id: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_passing_score?: number
          organization_id?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          name: string
          slug: string
          status: Database["public"]["Enums"]["org_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          slug: string
          status?: Database["public"]["Enums"]["org_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          slug?: string
          status?: Database["public"]["Enums"]["org_status"]
          updated_at?: string
        }
        Relationships: []
      }
      platform_admins: {
        Row: {
          created_at: string
          created_by: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_admins_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_admins_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_private: {
        Row: {
          created_at: string
          dni: string | null
          email: string
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          dni?: string | null
          email: string
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          dni?: string | null
          email?: string
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_private_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          first_name: string
          id: string
          last_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          first_name: string
          id: string
          last_name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          first_name?: string
          id?: string
          last_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      question_banks: {
        Row: {
          course_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          course_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          course_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_banks_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_banks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_banks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      question_options: {
        Row: {
          created_at: string
          id: string
          is_correct: boolean
          label: string
          position: number
          question_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_correct?: boolean
          label: string
          position: number
          question_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_correct?: boolean
          label?: string
          position?: number
          question_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_options_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      questions: {
        Row: {
          created_at: string
          created_by: string | null
          default_points: number
          id: string
          is_active: boolean
          organization_id: string
          prompt: string
          question_bank_id: string
          type: Database["public"]["Enums"]["question_type"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          default_points?: number
          id?: string
          is_active?: boolean
          organization_id: string
          prompt: string
          question_bank_id: string
          type: Database["public"]["Enums"]["question_type"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          default_points?: number
          id?: string
          is_active?: boolean
          organization_id?: string
          prompt?: string
          question_bank_id?: string
          type?: Database["public"]["Enums"]["question_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "questions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "questions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "questions_question_bank_id_fkey"
            columns: ["question_bank_id"]
            isOneToOne: false
            referencedRelation: "question_banks"
            referencedColumns: ["id"]
          },
        ]
      }
      score_scale_ranges: {
        Row: {
          created_at: string
          id: string
          is_passing: boolean
          label: string
          max_score: number
          min_score: number
          organization_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_passing?: boolean
          label: string
          max_score: number
          min_score: number
          organization_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_passing?: boolean
          label?: string
          max_score?: number
          min_score?: number
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "score_scale_ranges_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      video_checkpoint_attempt_answers: {
        Row: {
          attempt_id: string
          is_correct: boolean
          option_id: string | null
          question_id: string
        }
        Insert: {
          attempt_id: string
          is_correct: boolean
          option_id?: string | null
          question_id: string
        }
        Update: {
          attempt_id?: string
          is_correct?: boolean
          option_id?: string | null
          question_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_checkpoint_attempt_answers_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "video_checkpoint_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_checkpoint_attempt_answers_option_id_fkey"
            columns: ["option_id"]
            isOneToOne: false
            referencedRelation: "video_checkpoint_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_checkpoint_attempt_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "video_checkpoint_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      video_checkpoint_attempts: {
        Row: {
          attempt_number: number
          checkpoint_id: string
          correct: number
          created_at: string
          enrollment_id: string
          id: string
          organization_id: string
          passed: boolean
          total: number
        }
        Insert: {
          attempt_number: number
          checkpoint_id: string
          correct: number
          created_at?: string
          enrollment_id: string
          id?: string
          organization_id: string
          passed: boolean
          total: number
        }
        Update: {
          attempt_number?: number
          checkpoint_id?: string
          correct?: number
          created_at?: string
          enrollment_id?: string
          id?: string
          organization_id?: string
          passed?: boolean
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "video_checkpoint_attempts_checkpoint_id_fkey"
            columns: ["checkpoint_id"]
            isOneToOne: false
            referencedRelation: "video_checkpoints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_checkpoint_attempts_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "course_enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_checkpoint_attempts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      video_checkpoint_options: {
        Row: {
          id: string
          is_correct: boolean
          label: string
          position: number
          question_id: string
        }
        Insert: {
          id?: string
          is_correct?: boolean
          label: string
          position: number
          question_id: string
        }
        Update: {
          id?: string
          is_correct?: boolean
          label?: string
          position?: number
          question_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_checkpoint_options_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "video_checkpoint_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      video_checkpoint_progress: {
        Row: {
          attempts: number
          checkpoint_id: string
          enrollment_id: string
          passed_at: string | null
        }
        Insert: {
          attempts?: number
          checkpoint_id: string
          enrollment_id: string
          passed_at?: string | null
        }
        Update: {
          attempts?: number
          checkpoint_id?: string
          enrollment_id?: string
          passed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "video_checkpoint_progress_checkpoint_id_fkey"
            columns: ["checkpoint_id"]
            isOneToOne: false
            referencedRelation: "video_checkpoints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_checkpoint_progress_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "course_enrollments"
            referencedColumns: ["id"]
          },
        ]
      }
      video_checkpoint_questions: {
        Row: {
          checkpoint_id: string
          id: string
          position: number
          prompt: string
        }
        Insert: {
          checkpoint_id: string
          id?: string
          position: number
          prompt: string
        }
        Update: {
          checkpoint_id?: string
          id?: string
          position?: number
          prompt?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_checkpoint_questions_checkpoint_id_fkey"
            columns: ["checkpoint_id"]
            isOneToOne: false
            referencedRelation: "video_checkpoints"
            referencedColumns: ["id"]
          },
        ]
      }
      video_checkpoints: {
        Row: {
          at_seconds: number
          block_id: string
          created_at: string
          id: string
          min_correct: number
          organization_id: string
          updated_at: string
        }
        Insert: {
          at_seconds: number
          block_id: string
          created_at?: string
          id?: string
          min_correct: number
          organization_id: string
          updated_at?: string
        }
        Update: {
          at_seconds?: number
          block_id?: string
          created_at?: string
          id?: string
          min_correct?: number
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_checkpoints_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "lesson_content_blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_checkpoints_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_group_members: {
        Args: { p_group: string; p_user_ids: string[] }
        Returns: number
      }
      admin_update_member_profile: {
        Args: {
          p_dni: string
          p_first_name: string
          p_last_name: string
          p_phone: string
          p_user: string
        }
        Returns: undefined
      }
      answer_video_checkpoint: {
        Args: { p_answers: Json; p_checkpoint: string; p_enrollment: string }
        Returns: {
          correct: number
          min_correct: number
          passed: boolean
          total: number
        }[]
      }
      archive_course: { Args: { p_course: string }; Returns: undefined }
      assert_attempt_owner: {
        Args: { p_attempt: string }
        Returns: {
          active_session_id: string | null
          assessment_id: string
          attempt_number: number
          auto_score: number
          availability_until: string | null
          created_at: string
          duration_seconds: number | null
          effective_end_at: string | null
          enrollment_id: string
          graded_at: string | null
          id: string
          manual_score: number
          max_score: number
          organization_id: string
          passed: boolean | null
          score_label: string | null
          score_percent: number | null
          session_last_seen_at: string | null
          started_at: string
          status: Database["public"]["Enums"]["attempt_status"]
          submitted_at: string | null
          submitted_late: boolean
          total_score: number
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "assessment_attempts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      assert_subtree_deletable: {
        Args: { p_lesson: string; p_module: string; p_offering: string }
        Returns: undefined
      }
      assert_valid_profile_fields: {
        Args: {
          p_dni: string
          p_first_name: string
          p_last_name: string
          p_phone: string
        }
        Returns: undefined
      }
      assessment_module_id: { Args: { p_assessment: string }; Returns: string }
      assessment_score_distribution: {
        Args: { p_assessment: string }
        Returns: {
          bucket_count: number
          label: string
        }[]
      }
      attempt_header: {
        Args: { p_attempt: string }
        Returns: {
          active_session_id: string
          assessment_id: string
          attempt_id: string
          attempt_number: number
          effective_end_at: string
          enrollment_id: string
          server_now: string
          started_at: string
          status: Database["public"]["Enums"]["attempt_status"]
        }[]
      }
      attempt_result: {
        Args: { p_attempt: string }
        Returns: {
          attempt_id: string
          overall_feedback: string
          passed: boolean
          score_label: string
          score_percent: number
          status: Database["public"]["Enums"]["attempt_status"]
        }[]
      }
      can_edit_offering: { Args: { p_offering: string }; Returns: boolean }
      can_edit_question_bank: { Args: { p_bank: string }; Returns: boolean }
      can_grade_attempt: { Args: { p_attempt: string }; Returns: boolean }
      can_view_attempt: { Args: { p_attempt: string }; Returns: boolean }
      can_view_block: { Args: { p_block: string }; Returns: boolean }
      can_view_enrollment: { Args: { p_enrollment: string }; Returns: boolean }
      can_write_offering_file: { Args: { p_name: string }; Returns: boolean }
      checkpoint_enrollment_check: {
        Args: { p_enrollment: string; p_lesson: string }
        Returns: string
      }
      complete_content_block: {
        Args: { p_block: string; p_completed: boolean; p_enrollment: string }
        Returns: {
          completed_blocks: number
          progress_percent: number
          total_blocks: number
        }[]
      }
      complete_registration: {
        Args: {
          p_dni: string
          p_first_name: string
          p_last_name: string
          p_phone: string
          p_token: string
        }
        Returns: string
      }
      copy_edition_content: {
        Args: { p_source: string; p_target: string }
        Returns: undefined
      }
      course_id_of_offering: { Args: { p_offering: string }; Returns: string }
      create_course: {
        Args: {
          p_access_type: Database["public"]["Enums"]["course_access"]
          p_description: string
          p_organization: string
          p_title: string
        }
        Returns: string
      }
      create_organization: {
        Args: { p_name: string; p_slug: string }
        Returns: {
          link_token: string
          organization_id: string
        }[]
      }
      create_registration_link: {
        Args: {
          p_expires_at?: string
          p_label: string
          p_max_uses?: number
          p_org: string
          p_role?: Database["public"]["Enums"]["membership_role"]
        }
        Returns: {
          id: string
          token: string
        }[]
      }
      delete_assessment: { Args: { p_assessment: string }; Returns: undefined }
      delete_content_block: { Args: { p_block: string }; Returns: undefined }
      delete_lesson: { Args: { p_lesson: string }; Returns: undefined }
      delete_module: { Args: { p_module: string }; Returns: undefined }
      enrollment_module_summary: {
        Args: { p_enrollment: string }
        Returns: {
          completed_required: number
          module_id: string
          total_required: number
        }[]
      }
      extend_assessment_window: {
        Args: { p_assessment: string; p_new_until: string }
        Returns: number
      }
      finalize_attempt: {
        Args: { p_attempt: string; p_reason: string }
        Returns: {
          score_label: string
          score_percent: number
          status: Database["public"]["Enums"]["attempt_status"]
          total_score: number
        }[]
      }
      finalize_expired_attempts: { Args: never; Returns: number }
      get_registration_link_public: {
        Args: { p_token: string }
        Returns: {
          exhausted: boolean
          organization_name: string
          valid: boolean
        }[]
      }
      grade_open_answer: {
        Args: {
          p_attempt: string
          p_attempt_question: string
          p_feedback?: string
          p_points: number
        }
        Returns: {
          score_label: string
          score_percent: number
          status: Database["public"]["Enums"]["attempt_status"]
          total_score: number
        }[]
      }
      grade_task_submission: {
        Args: {
          p_attempt: string
          p_feedback?: string
          p_score: number
          p_submitted_at?: string
        }
        Returns: {
          passed: boolean
          score_label: string
          score_percent: number
          status: Database["public"]["Enums"]["attempt_status"]
        }[]
      }
      heartbeat: {
        Args: { p_attempt: string; p_force?: boolean; p_session: string }
        Returns: {
          active_session_id: string
          effective_end_at: string
          server_now: string
          stale_seconds: number
          status: Database["public"]["Enums"]["attempt_status"]
        }[]
      }
      is_enrolled_in_course: { Args: { p_course: string }; Returns: boolean }
      is_offering_professor: { Args: { p_offering: string }; Returns: boolean }
      is_org_admin: { Args: { p_org: string }; Returns: boolean }
      is_org_member: { Args: { p_org: string }; Returns: boolean }
      is_platform_admin: { Args: never; Returns: boolean }
      is_professor_of_any_edition: {
        Args: { p_course: string }
        Returns: boolean
      }
      list_my_attempts: {
        Args: { p_enrollment: string }
        Returns: {
          assessment_id: string
          attempts_used: number
          available_from: string
          available_until: string
          duration_seconds: number
          kind: Database["public"]["Enums"]["assessment_kind"]
          last_attempt_id: string
          last_status: Database["public"]["Enums"]["attempt_status"]
          max_attempts: number
          overall_feedback: string
          passed: boolean
          passing_score: number
          score_label: string
          score_percent: number
          title: string
        }[]
      }
      log_audit: {
        Args: {
          p_action: string
          p_entity_id?: string
          p_entity_type: string
          p_metadata?: Json
          p_org: string
        }
        Returns: undefined
      }
      log_audit_system: {
        Args: {
          p_action: string
          p_entity_id?: string
          p_entity_type: string
          p_metadata?: Json
          p_org: string
        }
        Returns: undefined
      }
      module_unlock_state: {
        Args: { p_enrollment: string }
        Returns: {
          available_from: string
          available_until: string
          module_id: string
          reason: string
          state: string
        }[]
      }
      my_enrollment_summaries: {
        Args: { p_enrollment?: string }
        Returns: {
          completed_at: string
          completed_blocks: number
          course_description: string
          course_id: string
          course_status: Database["public"]["Enums"]["course_status"]
          course_title: string
          ends_at: string
          enrollment_id: string
          offering_id: string
          offering_name: string
          offering_status: Database["public"]["Enums"]["offering_status"]
          progress_percent: number
          source: Database["public"]["Enums"]["enrollment_source"]
          status: Database["public"]["Enums"]["enrollment_status"]
          total_blocks: number
        }[]
      }
      my_task_submission: {
        Args: { p_assessment: string; p_enrollment: string }
        Returns: {
          attempt_id: string
          feedback: string
          files: Json
          passed: boolean
          score_label: string
          score_percent: number
          status: Database["public"]["Enums"]["attempt_status"]
          submitted_at: string
          submitted_late: boolean
        }[]
      }
      normalize_dni: { Args: { p_dni: string }; Returns: string }
      offering_id_of_assessment: {
        Args: { p_assessment: string }
        Returns: string
      }
      offering_id_of_block: { Args: { p_block: string }; Returns: string }
      offering_id_of_lesson: { Args: { p_lesson: string }; Returns: string }
      offering_id_of_module: { Args: { p_module: string }; Returns: string }
      org_assessment_stats: {
        Args: { p_org: string }
        Returns: {
          assessment_id: string
          attempts_count: number
          avg_score_percent: number
          course_id: string
          course_title: string
          failed_count: number
          graded_count: number
          kind: Database["public"]["Enums"]["assessment_kind"]
          passed_count: number
          submitted_count: number
          title: string
        }[]
      }
      org_course_stats: {
        Args: { p_org: string }
        Returns: {
          avg_progress_percent: number
          completion_rate: number
          course_id: string
          course_title: string
          enrolled_count: number
          last_activity: string
          offerings_count: number
          status: Database["public"]["Enums"]["course_status"]
        }[]
      }
      org_overview_stats: {
        Args: { p_org: string }
        Returns: {
          admins_active: number
          attempts_auto_submitted: number
          attempts_graded: number
          attempts_in_progress: number
          attempts_submitted: number
          courses_archived: number
          courses_draft: number
          courses_published: number
          professors_active: number
          professors_total: number
          students_active: number
          students_completed_course: number
          students_total: number
          students_with_enrollment: number
        }[]
      }
      org_professor_stats: {
        Args: { p_org: string }
        Returns: {
          assigned_courses_count: number
          attempts_graded_count: number
          first_name: string
          last_graded_at: string
          last_name: string
          pending_grading_count: number
          professor_user_id: string
        }[]
      }
      platform_org_stats: {
        Args: never
        Returns: {
          attempts_count: number
          avg_progress_percent: number
          courses_count: number
          enrollments_count: number
          name: string
          organization_id: string
          professors_count: number
          status: Database["public"]["Enums"]["org_status"]
          students_count: number
        }[]
      }
      professor_overview_stats: {
        Args: never
        Returns: {
          attempts_auto_submitted: number
          attempts_graded: number
          attempts_in_progress: number
          attempts_submitted: number
          avg_progress_percent: number
          course_id: string
          course_title: string
          enrolled_count: number
          pending_grading_count: number
        }[]
      }
      publish_course: { Args: { p_course: string }; Returns: undefined }
      question_bank_id_of_question: {
        Args: { p_question: string }
        Returns: string
      }
      recalc_enrollment_progress: {
        Args: { p_enrollment: string }
        Returns: undefined
      }
      refresh_offering_enrollment_totals: {
        Args: { p_offering: string }
        Returns: undefined
      }
      release_session: {
        Args: { p_attempt: string; p_session: string }
        Returns: undefined
      }
      remove_group_member: {
        Args: { p_group: string; p_user: string }
        Returns: undefined
      }
      reorder_content_blocks: {
        Args: { p_lesson: string; p_ordered_ids: string[] }
        Returns: undefined
      }
      reorder_lessons: {
        Args: { p_module: string; p_ordered_ids: string[] }
        Returns: undefined
      }
      reorder_modules: {
        Args: { p_offering: string; p_ordered_ids: string[] }
        Returns: undefined
      }
      replace_question_options: {
        Args: { p_options: Json; p_question: string }
        Returns: undefined
      }
      required_block_count_for_offering: {
        Args: { p_offering: string }
        Returns: number
      }
      resolve_score_label: {
        Args: { p_org: string; p_percent: number }
        Returns: {
          is_passing: boolean
          label: string
        }[]
      }
      save_answers_batch: {
        Args: { p_answers: Json; p_attempt: string; p_session: string }
        Returns: {
          accepted: Json
          effective_end_at: string
          server_now: string
          status: Database["public"]["Enums"]["attempt_status"]
        }[]
      }
      save_video_checkpoints: {
        Args: { p_block: string; p_checkpoints: Json }
        Returns: undefined
      }
      search_assignable_professors: {
        Args: { p_offering: string; p_q: string }
        Returns: {
          email: string
          full_name: string
          user_id: string
        }[]
      }
      self_enroll_free_course: { Args: { p_course: string }; Returns: string }
      set_assessment_questions: {
        Args: { p_assessment: string; p_items: Json }
        Returns: undefined
      }
      set_membership_role: {
        Args: {
          p_membership: string
          p_role: Database["public"]["Enums"]["membership_role"]
        }
        Returns: undefined
      }
      set_membership_status: {
        Args: {
          p_membership: string
          p_status: Database["public"]["Enums"]["membership_status"]
        }
        Returns: undefined
      }
      shares_active_org: { Args: { p_user: string }; Returns: boolean }
      start_attempt: {
        Args: { p_assessment: string; p_enrollment: string }
        Returns: string
      }
      student_attempt_view: {
        Args: { p_attempt: string }
        Returns: {
          attempt_question_id: string
          client_seq: number
          feedback: string
          is_correct: boolean
          options: Json
          points: number
          points_awarded: number
          position: number
          prompt: string
          selected_option_id: string
          text_answer: string
          type: Database["public"]["Enums"]["question_type"]
        }[]
      }
      student_can_view_course: { Args: { p_course: string }; Returns: boolean }
      student_can_view_offering: {
        Args: { p_offering: string }
        Returns: boolean
      }
      submit_attempt: {
        Args: { p_answers?: Json; p_attempt: string; p_session: string }
        Returns: {
          score_label: string
          score_percent: number
          status: Database["public"]["Enums"]["attempt_status"]
          total_score: number
        }[]
      }
      submit_task: {
        Args: { p_assessment: string; p_enrollment: string; p_files: Json }
        Returns: {
          attempt_id: string
          removed_paths: string[]
        }[]
      }
      sync_group_offerings: { Args: { p_group: string }; Returns: undefined }
      sync_offering_enrollments: {
        Args: { p_offering: string }
        Returns: number
      }
      sync_offering_roster: { Args: { p_offering: string }; Returns: number }
      task_file_for_download: {
        Args: { p_file: string }
        Returns: {
          filename: string
          storage_path: string
        }[]
      }
      task_file_mime_for_name: { Args: { p_name: string }; Returns: string }
      task_submission_check: {
        Args: { p_assessment: string; p_enrollment: string }
        Returns: {
          attempt_id: string
          course_id: string
          is_late: boolean
          max_files: number
          organization_id: string
        }[]
      }
      task_submission_slot: {
        Args: { p_assessment: string; p_enrollment: string }
        Returns: {
          course_id: string
          is_late: boolean
          max_files: number
          organization_id: string
        }[]
      }
      update_my_profile: {
        Args: {
          p_dni: string
          p_first_name: string
          p_last_name: string
          p_phone: string
        }
        Returns: undefined
      }
      upsert_attempt_feedback: {
        Args: { p_attempt: string; p_feedback: string }
        Returns: undefined
      }
      user_org_role: {
        Args: { p_org: string }
        Returns: Database["public"]["Enums"]["membership_role"]
      }
      video_checkpoint_offering: {
        Args: { p_checkpoint: string }
        Returns: string
      }
      video_checkpoint_stats: { Args: { p_block: string }; Returns: Json }
      video_checkpoints_for_lesson: {
        Args: { p_enrollment: string; p_lesson: string }
        Returns: Json
      }
    }
    Enums: {
      assessment_kind: "QUIZ" | "TASK" | "EXAM"
      assessment_status: "DRAFT" | "PUBLISHED"
      attempt_status: "IN_PROGRESS" | "SUBMITTED" | "AUTO_SUBMITTED" | "GRADED"
      content_block_type:
        | "YOUTUBE_VIDEO"
        | "RICH_TEXT"
        | "PDF"
        | "IMAGE"
        | "EXTERNAL_LINK"
        | "QUIZ"
        | "TASK"
      course_access: "FREE" | "PRIVATE"
      course_status: "DRAFT" | "PUBLISHED" | "ARCHIVED"
      dependency_condition: "MODULE_COMPLETED" | "QUIZ_PASSED"
      enrollment_source: "GROUP_ASSIGNMENT" | "FREE_COURSE"
      enrollment_status: "ACTIVE" | "COMPLETED" | "CANCELLED"
      membership_role: "ADMIN" | "PROFESSOR" | "STUDENT"
      membership_status: "ACTIVE" | "INACTIVE"
      offering_kind: "GROUP" | "OPEN"
      offering_status: "ACTIVE" | "CANCELLED"
      org_status: "ACTIVE" | "INACTIVE"
      question_type: "MULTIPLE_CHOICE" | "OPEN_ENDED"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      assessment_kind: ["QUIZ", "TASK", "EXAM"],
      assessment_status: ["DRAFT", "PUBLISHED"],
      attempt_status: ["IN_PROGRESS", "SUBMITTED", "AUTO_SUBMITTED", "GRADED"],
      content_block_type: [
        "YOUTUBE_VIDEO",
        "RICH_TEXT",
        "PDF",
        "IMAGE",
        "EXTERNAL_LINK",
        "QUIZ",
        "TASK",
      ],
      course_access: ["FREE", "PRIVATE"],
      course_status: ["DRAFT", "PUBLISHED", "ARCHIVED"],
      dependency_condition: ["MODULE_COMPLETED", "QUIZ_PASSED"],
      enrollment_source: ["GROUP_ASSIGNMENT", "FREE_COURSE"],
      enrollment_status: ["ACTIVE", "COMPLETED", "CANCELLED"],
      membership_role: ["ADMIN", "PROFESSOR", "STUDENT"],
      membership_status: ["ACTIVE", "INACTIVE"],
      offering_kind: ["GROUP", "OPEN"],
      offering_status: ["ACTIVE", "CANCELLED"],
      org_status: ["ACTIVE", "INACTIVE"],
      question_type: ["MULTIPLE_CHOICE", "OPEN_ENDED"],
    },
  },
} as const

