const SAFE_PROVIDER_CODES = new Set([
  '42501', '42P01', '42703',
  'PGRST202', 'PGRST204', 'PGRST205', 'PGRST301', 'PGRST302',
  'bad_jwt', 'not_admin', 'invalid_credentials',
])

export function isSafeServiceUrl(value) {
  if (typeof value !== 'string') return false
  try {
    const url = new URL(value)
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    return !url.username && !url.password && !url.search && !url.hash
      && url.pathname === '/'
      && (url.protocol === 'https:' || (url.protocol === 'http:' && loopback))
  }
  catch { return false }
}

export function safeProviderCode(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return undefined
  const code = payload.code ?? payload.error_code
  return typeof code === 'string' && SAFE_PROVIDER_CODES.has(code) ? code : undefined
}

export function classifyServiceFailure(status, payload) {
  const providerCode = safeProviderCode(payload)
  let kind = 'request_failed'
  if (['PGRST205', '42P01', 'PGRST202'].includes(providerCode)) kind = 'missing_schema'
  else if (['PGRST204', '42703'].includes(providerCode)) kind = 'missing_columns'
  else if (['PGRST301', 'PGRST302', 'bad_jwt', 'not_admin', 'invalid_credentials'].includes(providerCode)) kind = 'credentials'
  return {
    httpStatus: status,
    ...(providerCode ? { providerCode } : {}),
    kind,
  }
}

export function isExpectedPermissionDenial(status, payload) {
  return [401, 403].includes(status) && safeProviderCode(payload) === '42501'
}

// Explicit projections verify column availability without returning any rows.
export const REQUIRED_TABLE_COLUMNS = Object.freeze({
  profiles: 'id,full_name,email,role,created_at,updated_at',
  reports: 'id,report_code,user_id,title,category,officer_category,description,image_path,latitude,longitude,location_name,incident_time,status,idempotency_key,revision,priority_dirty,priority_recalculate_at,is_simulation,is_public,public_summary,published_by,published_at,created_at,updated_at',
  ai_analyses: 'id,report_id,report_revision,analysis_status,detected_category,detected_indicators,visual_observation,reasoning_summary,confidence,risk_level,recommendation,needs_human_verification,raw_response,model_name,prompt_version,error_code,processing_expires_at,completed_at,created_at',
  threat_priorities: 'id,report_id,report_revision,effective_category,category_source,threat_severity,evidence_completeness,recency_score,nearby_reports_score,nearby_reports_count,total_score,priority_level,explanation,scoring_version,input_snapshot,calculated_at',
  report_updates: 'id,report_id,report_revision,actor_type,actor_id,admin_id,action,previous_status,new_status,note,created_at',
})
