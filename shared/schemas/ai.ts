import { z } from 'zod'
import { AI_CATEGORIES, AI_RISK_LEVELS } from '../constants/domain'

const observationText = z.string().trim().min(1).max(2_000)

// Provider output is untrusted. A structured provider response must still pass
// this full schema before any analysis is accepted or persisted as successful.
export const threatAnalysisSchema = z.strictObject({
  category: z.enum(AI_CATEGORIES),
  detected_indicators: z.array(z.string().trim().min(1).max(100)).max(20),
  visual_observation: observationText,
  risk_level: z.enum(AI_RISK_LEVELS),
  confidence: z.number().finite().min(0).max(1),
  reasoning_summary: observationText,
  recommendation: observationText,
  needs_human_verification: z.literal(true),
})
