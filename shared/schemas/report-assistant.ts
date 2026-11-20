import { z } from 'zod'
import { AI_CATEGORIES } from '../constants/domain'

export const assistantQuestionSchema = z.strictObject({
  id: z.enum(['q1', 'q2', 'q3']),
  text: z.string().trim().min(5).max(200),
  reason: z.string().trim().min(1).max(240),
})
// Returned JSON is untrusted even when the provider enforces a response schema.
export const assistantOutputSchema = z.strictObject({
  visual_observations: z.array(z.string().trim().min(1).max(300)).max(5),
  reported_summary: z.string().trim().min(1).max(1200),
  suggested_title: z.string().trim().min(5).max(160),
  suggested_category: z.enum(AI_CATEGORIES),
  questions: z.array(assistantQuestionSchema).max(3),
  limitations: z.string().trim().min(1).max(1000),
  needs_human_review: z.literal(true),
}).superRefine((value, context) => {
  if (new Set(value.questions.map(item => item.id)).size !== value.questions.length) {
    context.addIssue({ code: 'custom', path: ['questions'], message: 'Identitas pertanyaan tidak boleh berulang.' })
  }
})

export const assistantStartSchema = z.strictObject({
  id: z.uuid(), uploadId: z.uuid(),
  story: z.string().trim().min(20, 'Ceritakan pengamatan Anda minimal 20 karakter.').max(1500),
})
export const assistantAnswerSchema = z.strictObject({
  id: z.enum(['q1', 'q2', 'q3']),
  text: z.string().trim().min(1, 'Jawab pertanyaan atau pilih Saya tidak tahu.').max(500, 'Jawaban maksimal 500 karakter.'),
})
export const assistantAnswersSchema = z.strictObject({
  expectedVersion: z.number().int().positive(),
  answers: z.array(assistantAnswerSchema).max(3),
}).superRefine((value, context) => {
  if (new Set(value.answers.map(item => item.id)).size !== value.answers.length) {
    context.addIssue({ code: 'custom', path: ['answers'], message: 'Jawaban tidak boleh berulang.' })
  }
})
export const assistantConfirmationSchema = z.strictObject({
  draftId: z.uuid(), expectedVersion: z.number().int().positive(),
  confirmed: z.literal(true, { error: 'Periksa draf dan konfirmasikan sebelum mengirim laporan.' }),
})

export type AssistantOutput = z.infer<typeof assistantOutputSchema>
export type AssistantAnswer = z.infer<typeof assistantAnswerSchema>
export type AssistantStart = z.infer<typeof assistantStartSchema>
export type AssistantAnswers = z.infer<typeof assistantAnswersSchema>
export type AssistantConfirmation = z.infer<typeof assistantConfirmationSchema>

/** Preserve the reporter's exact words. AI observations are displayed separately,
 * never silently turned into a citizen's eyewitness statement. */
export function composeAssistantDescription(story: string, questions: AssistantOutput['questions'], answers: AssistantAnswer[]) {
  const known = new Set(questions.map(question => question.id))
  if (answers.some(answer => !known.has(answer.id))) throw new Error('UNKNOWN_ASSISTANT_ANSWER')
  const additions = questions.flatMap(question => {
    const answer = answers.find(item => item.id === question.id)?.text.trim()
    return answer ? [`${question.text}\n${answer}`] : []
  })
  return [story.trim(), ...(additions.length ? ['Informasi pelengkap dari pelapor:', ...additions] : [])].join('\n\n')
}
