/**
 * Initial schema-derived types for the foundation, reporting, analysis, priority and admin workflow migrations.
 * Handwritten, not generated from a connected database. Regenerate with the
 * Supabase CLI once migrations are applied; database grants remain authoritative.
 */
import type { CategorySource } from '../constants/scoring'
import type {
  AiRiskLevel,
  PriorityLevel,
  ReportStatus,
  ThreatCategory,
  UserRole,
} from './domain'

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]
export type DatabaseAnalysisStatus = 'pending' | 'processing' | 'succeeded' | 'failed'
export type DatabaseAuditActorType = 'user' | 'admin' | 'system'
export type EvidenceUploadStatus = 'pending' | 'processing' | 'finalized' | 'attached'

export type AssistantDraftRow = {
  id: string; user_id: string; upload_id: string; story: string
  status: 'processing' | 'ready' | 'failed' | 'submitted'
  version: number; lease_token: string | null; lease_expires_at: string | null
  result: Json | null; answers: Json; model_name: string; prompt_version: string
  error_code: string | null; expires_at: string; report_id: string | null
  created_at: string; updated_at: string
}

export type EvidenceUploadRow = {
  id: string
  user_id: string
  incoming_path: string
  sealed_path: string
  declared_mime_type: 'image/jpeg' | 'image/png' | 'image/webp'
  declared_size: number
  status: EvidenceUploadStatus
  processing_token: string | null
  processing_expires_at: string | null
  expires_at: string
  sealed_mime_type: 'image/jpeg' | null
  sealed_size: number | null
  sealed_sha256: string | null
  report_id: string | null
  created_at: string
  updated_at: string
}

export type ProfileRow = {
  id: string
  full_name: string
  email: string
  role: UserRole
  created_at: string
  updated_at: string
}

export type ReportRow = {
  id: string
  report_code: string
  user_id: string
  title: string
  category: ThreatCategory
  officer_category: ThreatCategory | null
  description: string
  image_path: string
  latitude: number
  longitude: number
  location_name: string | null
  incident_time: string
  status: ReportStatus
  idempotency_key: string
  revision: number
  priority_dirty: boolean
  priority_recalculate_at: string | null
  is_simulation: boolean
  is_public: boolean
  public_summary: string | null
  published_by: string | null
  published_at: string | null
  created_at: string
  updated_at: string
}

export type AiAnalysisRow = {
  id: string
  report_id: string
  report_revision: number
  analysis_status: DatabaseAnalysisStatus
  detected_category: ThreatCategory | 'uncertain' | null
  detected_indicators: Json | null
  visual_observation: string | null
  reasoning_summary: string | null
  confidence: number | null
  risk_level: AiRiskLevel | null
  recommendation: string | null
  needs_human_verification: boolean
  raw_response: Json | null
  model_name: string
  prompt_version: string
  error_code: string | null
  processing_expires_at: string | null
  completed_at: string | null
  created_at: string
}

export type ClaimReportAnalysisResult = { analysis: AiAnalysisRow; claimed: boolean }
export type FinishReportAnalysisResult = { analysis: AiAnalysisRow; accepted: boolean; reason: string | null }

export type ThreatPriorityRow = {
  id: string
  report_id: string
  report_revision: number
  effective_category: ThreatCategory
  category_source: CategorySource
  threat_severity: number
  evidence_completeness: number
  recency_score: number
  nearby_reports_score: number
  nearby_reports_count: number
  total_score: number
  priority_level: PriorityLevel
  explanation: string
  scoring_version: string
  input_snapshot: Json
  calculated_at: string
}

export type ReportUpdateRow = {
  id: string
  report_id: string
  report_revision: number
  actor_type: DatabaseAuditActorType
  actor_id: string | null
  admin_id: string | null
  action: string
  previous_status: ReportStatus | null
  new_status: ReportStatus
  note: string | null
  created_at: string
}

type InsertRow<Row, RequiredKeys extends keyof Row> = Pick<Row, RequiredKeys> & Partial<Omit<Row, RequiredKeys>>
type Relationship = {
  foreignKeyName: string
  columns: string[]
  isOneToOne: boolean
  referencedRelation: string
  referencedColumns: string[]
}
type Table<Row, RequiredKeys extends keyof Row, Relations extends Relationship[] = []> = {
  Row: Row
  Insert: InsertRow<Row, RequiredKeys>
  Update: Partial<Row>
  Relationships: Relations
}

export type Database = {
  public: {
    Tables: {
      profiles: Table<ProfileRow, 'id' | 'email'>
      report_assistant_drafts: Table<AssistantDraftRow, 'id' | 'user_id' | 'upload_id' | 'story' | 'model_name' | 'prompt_version' | 'expires_at'>
      evidence_uploads: Table<
        EvidenceUploadRow,
        'user_id' | 'incoming_path' | 'sealed_path' | 'declared_mime_type' | 'declared_size',
        [
          { foreignKeyName: 'evidence_uploads_user_id_fkey'; columns: ['user_id']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
          { foreignKeyName: 'evidence_uploads_report_id_fkey'; columns: ['report_id']; isOneToOne: false; referencedRelation: 'reports'; referencedColumns: ['id'] },
        ]
      >
      reports: Table<
        ReportRow,
        'user_id' | 'title' | 'category' | 'description' | 'image_path'
        | 'latitude' | 'longitude' | 'incident_time' | 'idempotency_key',
        [
          { foreignKeyName: 'reports_user_id_fkey'; columns: ['user_id']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
          { foreignKeyName: 'reports_published_by_fkey'; columns: ['published_by']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        ]
      >
      ai_analyses: Table<
        AiAnalysisRow,
        'report_id' | 'report_revision' | 'model_name' | 'prompt_version',
        [{ foreignKeyName: 'ai_analyses_report_id_fkey'; columns: ['report_id']; isOneToOne: false; referencedRelation: 'reports'; referencedColumns: ['id'] }]
      >
      threat_priorities: Table<
        ThreatPriorityRow,
        'report_id' | 'report_revision' | 'effective_category' | 'category_source'
        | 'threat_severity' | 'evidence_completeness' | 'recency_score'
        | 'nearby_reports_score' | 'nearby_reports_count' | 'total_score'
        | 'priority_level' | 'explanation' | 'scoring_version' | 'input_snapshot',
        [{ foreignKeyName: 'threat_priorities_report_id_fkey'; columns: ['report_id']; isOneToOne: false; referencedRelation: 'reports'; referencedColumns: ['id'] }]
      >
      report_updates: Table<
        ReportUpdateRow,
        'report_id' | 'report_revision' | 'actor_type' | 'action' | 'new_status',
        [
          { foreignKeyName: 'report_updates_report_id_fkey'; columns: ['report_id']; isOneToOne: false; referencedRelation: 'reports'; referencedColumns: ['id'] },
          { foreignKeyName: 'report_updates_actor_id_fkey'; columns: ['actor_id']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
          { foreignKeyName: 'report_updates_admin_id_fkey'; columns: ['admin_id']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        ]
      >
    }
    Views: { [_ in never]: never }
    Functions: {
      claim_report_assistant: {
        Args: { p_id: string; p_actor_id: string; p_upload_id: string; p_story: string; p_model_name: string; p_prompt_version: string }
        Returns: { draft: AssistantDraftRow; claimed: boolean }
      }
      finish_report_assistant: {
        Args: { p_id: string; p_actor_id: string; p_lease_token: string; p_result?: Json | null; p_error_code?: string | null }
        Returns: AssistantDraftRow
      }
      answer_report_assistant: {
        Args: { p_id: string; p_actor_id: string; p_expected_version: number; p_answers: Json }
        Returns: AssistantDraftRow
      }
      create_assisted_report: {
        Args: { p_draft_id: string; p_actor_id: string; p_expected_version: number; p_confirmed: boolean; p_idempotency_key: string; p_payload: Json; p_is_simulation: boolean }
        Returns: { report: ReportRow; reused: boolean }
      }
      consume_rate_limit: {
        Args: { p_key: string; p_limit: number; p_window_seconds: number }
        Returns: { allowed: boolean; remaining: number; retry_after_seconds: number }[]
      }
      admin_change_report_status: {
        Args: {
          p_report_id: string
          p_actor_id: string
          p_expected_revision: number
          p_new_status: ReportStatus
          p_note?: string | null
        }
        Returns: ReportRow
      }
      claim_evidence_upload: {
        Args: { p_upload_id: string; p_actor_id: string; p_processing_token: string }
        Returns: EvidenceUploadRow
      }
      complete_evidence_upload: {
        Args: {
          p_upload_id: string
          p_actor_id: string
          p_processing_token: string
          p_sealed_size: number
          p_sealed_mime_type: string
          p_sealed_sha256: string
        }
        Returns: EvidenceUploadRow
      }
      fail_evidence_upload: {
        Args: { p_upload_id: string; p_actor_id: string; p_processing_token: string }
        Returns: EvidenceUploadRow
      }
      delete_expired_evidence_upload: {
        Args: { p_upload_id: string; p_actor_id: string }
        Returns: boolean
      }
      create_report: {
        Args: { p_actor_id: string; p_idempotency_key: string; p_payload: Json; p_is_simulation?: boolean }
        Returns: ReportRow
      }
      update_owned_report: {
        Args: { p_actor_id: string; p_report_id: string; p_expected_revision: number; p_payload: Json }
        Returns: ReportRow
      }
      claim_report_analysis: {
        Args: {
          p_report_id: string
          p_actor_id: string
          p_expected_revision: number
          p_model_name: string
          p_prompt_version: string
          p_force?: boolean
        }
        Returns: ClaimReportAnalysisResult
      }
      complete_report_analysis: {
        Args: { p_analysis_id: string; p_actor_id: string; p_output: Json }
        Returns: FinishReportAnalysisResult
      }
      fail_report_analysis: {
        Args: { p_analysis_id: string; p_actor_id: string; p_error_code: string }
        Returns: FinishReportAnalysisResult
      }
      platform_statistics: {
        Args: Record<PropertyKey, never>
        Returns: { total_reports: number; verified_reports: number; in_progress_reports: number; named_locations: number }[]
      }
      refresh_threat_priorities: {
        Args: { p_report_ids?: string[] | null; p_limit?: number; p_wait?: boolean }
        Returns: Json
      }
      admin_map_reports: {
        Args: {
          p_actor_id: string
          p_category?: ThreatCategory | null
          p_priority?: string | null
          p_status?: ReportStatus | null
          p_from?: string | null
          p_to?: string | null
          p_dataset?: string
          p_limit?: number
          p_offset?: number
        }
        Returns: Json
      }
      admin_report_queue: {
        Args: {
          p_actor_id: string
          p_scope?: string
          p_category?: ThreatCategory | null
          p_priority?: string | null
          p_dataset?: string
          p_limit?: number
          p_offset?: number
        }
        Returns: Json
      }
      admin_publish_report: {
        Args: { p_report_id: string; p_actor_id: string; p_expected_revision: number; p_public_summary: string }
        Returns: ReportRow
      }
      admin_withdraw_publication: {
        Args: { p_report_id: string; p_actor_id: string; p_expected_revision: number; p_note: string }
        Returns: ReportRow
      }
      admin_set_officer_category: {
        Args: { p_report_id: string; p_actor_id: string; p_expected_revision: number; p_category: ThreatCategory | null; p_note?: string | null }
        Returns: ReportRow
      }
      admin_add_report_note: {
        Args: { p_report_id: string; p_actor_id: string; p_note: string }
        Returns: ReportUpdateRow
      }
      admin_analytics: {
        Args: { p_actor_id: string; p_dataset?: string; p_days?: number }
        Returns: Json
      }
      public_map_reports: {
        Args: {
          p_category?: ThreatCategory | null
          p_priority?: string | null
          p_status?: ReportStatus | null
          p_from?: string | null
          p_to?: string | null
          p_report_id?: string | null
          p_limit?: number
          p_offset?: number
        }
        Returns: Json
      }
    }
    Enums: {
      user_role: UserRole
      threat_category: ThreatCategory
      report_status: ReportStatus
      analysis_status: DatabaseAnalysisStatus
      risk_level: AiRiskLevel
      priority_level: PriorityLevel
      audit_actor_type: DatabaseAuditActorType
      evidence_upload_status: EvidenceUploadStatus
    }
    CompositeTypes: { [_ in never]: never }
  }
}
