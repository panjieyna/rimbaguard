import type { AssistantAnswer, AssistantOutput } from '../schemas/report-assistant'
import type { AiFailureCode } from '../constants/analysis'

export interface AssistantDraft {
  id: string
  uploadId: string
  version: number
  status: 'processing' | 'ready' | 'failed' | 'submitted'
  story: string
  result: AssistantOutput | null
  answers: AssistantAnswer[]
  description: string
  errorCode: AiFailureCode | null
  evidencePath: string
  evidenceUrl: string | null
  expiresAt: string
  reportId: string | null
}
export interface AssistantDraftResponse { draft: AssistantDraft; reused?: boolean }
