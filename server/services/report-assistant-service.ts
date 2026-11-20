import type { H3Event } from 'h3'
import type { CreateReportInput, SessionUser } from '../../shared/types/domain'
import type { AssistantDraftRow } from '../../shared/types/database'
import type { AssistantDraftResponse } from '../../shared/types/report-assistant'
import { assistantAnswersSchema, assistantOutputSchema, composeAssistantDescription, type AssistantAnswers, type AssistantConfirmation, type AssistantStart } from '../../shared/schemas/report-assistant'
import { AI_FAILURE_MESSAGES, type AiFailureCode } from '../../shared/constants/analysis'
import { MAX_EVIDENCE_BYTES } from '../../shared/constants/domain'
import { evidencePathSchema } from '../../shared/schemas/reports'
import { getServiceDatabase, getUserDatabase } from '../utils/supabase'
import { getServerEnvironment } from '../utils/config'
import { apiError, databaseUnavailable } from '../utils/response'
import { assistReport, ASSISTANT_PROMPT_VERSION } from './ai/report-assistant'
import { DEFAULT_GEMINI_MODEL, resolveGeminiModel, ThreatAnalysisError } from './ai/threat-analysis'
import { toReportSummary } from './report-service'

function assistantDatabaseError(error: { code?: string; message?: string }): never {
  if (['PGRST202','PGRST204','PGRST205','42P01','42883'].includes(error.code ?? '')) throw apiError(503,'ASSISTANT_SCHEMA_UNAVAILABLE','Asisten belum tersedia. Anda tetap dapat mengisi formulir sendiri.')
  if (error.code === 'P0002') throw apiError(404,'ASSISTANT_NOT_FOUND','Draf tidak ditemukan atau tidak dapat diakses.')
  if (error.message?.includes('expired')) throw apiError(409,'EVIDENCE_EXPIRED','Batas waktu foto berakhir. Pilih ulang foto untuk memulai draf baru.')
  if (['PT409','40001','23505'].includes(error.code ?? '')) throw apiError(409,'ASSISTANT_CONFLICT','Draf sudah berubah atau sedang diproses. Muat ulang draf sebelum melanjutkan.')
  if (error.code === '42501') throw apiError(403,'ASSISTANT_FORBIDDEN','Foto atau draf tidak dapat digunakan untuk tindakan ini.')
  if (['22023','23514'].includes(error.code ?? '')) throw apiError(422,'ASSISTANT_INVALID','Periksa jawaban, konfirmasi draf, atau foto yang dipilih.')
  throw databaseUnavailable()
}

async function receiptFor(user: SessionUser, row: AssistantDraftRow) {
  const receipt = await getServiceDatabase().from('evidence_uploads').select('*').eq('id',row.upload_id).eq('user_id',user.id).maybeSingle()
  if (receipt.error) assistantDatabaseError(receipt.error)
  if (!receipt.data || row.user_id !== user.id) throw apiError(404,'ASSISTANT_NOT_FOUND','Draf tidak ditemukan atau tidak dapat diakses.')
  const path = evidencePathSchema.safeParse(receipt.data.sealed_path)
  if (!path.success || !path.data.startsWith(`${user.id}/sealed/`)) throw apiError(503,'ASSISTANT_EVIDENCE_UNAVAILABLE','Foto draf belum dapat dibaca.')
  return receipt.data
}

export async function assistantResponse(user: SessionUser, row: AssistantDraftRow): Promise<AssistantDraftResponse> {
  const receipt = await receiptFor(user,row)
  const output = row.result === null ? null : assistantOutputSchema.safeParse(row.result)
  const answers = assistantAnswersSchema.safeParse({ expectedVersion:row.version,answers:row.answers })
  if ((output && !output.success) || !answers.success) throw apiError(503,'ASSISTANT_INVALID_SAVED_DATA','Draf tersimpan belum dapat dibaca. Coba kembali atau gunakan formulir manual.')
  const result = output?.success ? output.data : null
  const description = result ? composeAssistantDescription(row.story,result.questions,answers.data.answers) : row.story
  let evidenceUrl: string | null = null
  if (Date.parse(row.expires_at)>Date.now() || row.report_id) {
    const signed = await getServiceDatabase().storage.from('report-evidence').createSignedUrl(receipt.sealed_path,300)
    evidenceUrl = signed.data?.signedUrl ?? null // A preview failure must not lose the saved draft.
  }
  const errorCode: AiFailureCode | null = row.error_code && Object.hasOwn(AI_FAILURE_MESSAGES,row.error_code) ? row.error_code as AiFailureCode : null
  return { draft: { id:row.id,uploadId:row.upload_id,version:row.version,status:row.status,story:row.story,result,answers:answers.data.answers,
    description,errorCode,evidencePath:receipt.sealed_path,evidenceUrl,expiresAt:row.expires_at,reportId:row.report_id } }
}

export async function getAssistantDraft(event: H3Event,user: SessionUser,id?: string) {
  let query = getUserDatabase(event).from('report_assistant_drafts').select('*').eq('user_id',user.id)
  if (id) query = query.eq('id',id)
  else query = query.in('status',['processing','ready','failed']).gt('expires_at',new Date().toISOString())
  const saved = await query.order('created_at',{ascending:false}).limit(1).maybeSingle()
  if (saved.error) assistantDatabaseError(saved.error)
  if (!saved.data) {
    if (!id) return { draft:null }
    throw apiError(404,'ASSISTANT_NOT_FOUND','Draf tidak ditemukan atau tidak dapat diakses.')
  }
  return assistantResponse(user,saved.data)
}

export async function startAssistant(user: SessionUser,input: AssistantStart): Promise<AssistantDraftResponse> {
  const config = getServerEnvironment()
  let model = DEFAULT_GEMINI_MODEL
  try { model = resolveGeminiModel(config.geminiModel) } catch { model = 'unconfigured' }
  const database = getServiceDatabase()
  const claimed = await database.rpc('claim_report_assistant',{p_id:input.id,p_actor_id:user.id,p_upload_id:input.uploadId,p_story:input.story,p_model_name:model,p_prompt_version:ASSISTANT_PROMPT_VERSION})
  if (claimed.error) assistantDatabaseError(claimed.error)
  if (!claimed.data?.draft) throw databaseUnavailable()
  const row = claimed.data.draft
  if (!claimed.data.claimed) return { ...await assistantResponse(user,row),reused:true }
  const receipt = await receiptFor(user,row)
  let result
  try {
    if (!config.geminiApiKey) throw new ThreatAnalysisError('AI_NOT_CONFIGURED')
    const image = await database.storage.from('report-evidence').download(receipt.sealed_path)
    if (image.error || !image.data || !image.data.size || image.data.size>MAX_EVIDENCE_BYTES) throw new ThreatAnalysisError('AI_EVIDENCE_UNAVAILABLE')
    result = await assistReport(new Uint8Array(await image.data.arrayBuffer()),input.story,{apiKey:config.geminiApiKey,model:config.geminiModel})
  }
  catch (error) {
    const errorCode = error instanceof ThreatAnalysisError ? error.code : 'AI_PROVIDER_UNAVAILABLE'
    const failed = await database.rpc('finish_report_assistant',{p_id:row.id,p_actor_id:user.id,p_lease_token:row.lease_token!,p_error_code:errorCode})
    if (failed.error) assistantDatabaseError(failed.error)
    if (!failed.data) throw databaseUnavailable()
    return assistantResponse(user,failed.data)
  }
  const completed = await database.rpc('finish_report_assistant',{p_id:row.id,p_actor_id:user.id,p_lease_token:row.lease_token!,p_result:result.output})
  if (completed.error) assistantDatabaseError(completed.error)
  if (!completed.data) throw databaseUnavailable()
  return assistantResponse(user,completed.data)
}

export async function answerAssistant(user: SessionUser,id: string,input: AssistantAnswers) {
  const saved = await getServiceDatabase().rpc('answer_report_assistant',{p_id:id,p_actor_id:user.id,p_expected_version:input.expectedVersion,p_answers:input.answers})
  if (saved.error) assistantDatabaseError(saved.error)
  if (!saved.data) throw databaseUnavailable()
  return assistantResponse(user,saved.data)
}

export async function createAssistedReport(user: SessionUser,input: CreateReportInput,key: string,confirmation: AssistantConfirmation) {
  const created = await getServiceDatabase().rpc('create_assisted_report',{
    p_draft_id:confirmation.draftId,p_actor_id:user.id,p_expected_version:confirmation.expectedVersion,p_confirmed:confirmation.confirmed,
    p_idempotency_key:key,p_payload:{...input},p_is_simulation:process.env.RIMBAGUARD_TEST_USER_ID===user.id,
  })
  if (created.error) assistantDatabaseError(created.error)
  if (!created.data?.report) throw databaseUnavailable()
  return { report:toReportSummary(created.data.report),idempotentReplay:created.data.reused }
}
