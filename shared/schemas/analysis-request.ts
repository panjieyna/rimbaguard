import { z } from 'zod'

export const analysisRequestSchema = z.strictObject({
  expectedRevision: z.number().int().positive(),
  force: z.boolean().default(false),
})

export type AnalysisRequest = z.infer<typeof analysisRequestSchema>
