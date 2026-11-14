import { defineEventHandler, getQuery, sendRedirect, setHeader } from 'h3'
import { z } from 'zod'
import { getSessionUserFromClient } from '../../utils/auth'
import { safeAuthRedirect } from '../../utils/auth-errors'
import { getUserDatabase } from '../../utils/supabase'

const callbackSchema = z.object({
  code: z.string().min(1).max(2_048).optional(),
  token_hash: z.string().min(1).max(2_048).optional(),
  type: z.enum(['email', 'signup']).optional(),
  next: z.string().max(1_024).optional(),
}).superRefine((input, context) => {
  if (Boolean(input.code) === Boolean(input.token_hash) || (input.token_hash && !input.type)) {
    context.addIssue({ code: 'custom', message: 'Invalid confirmation callback.' })
  }
})

export default defineEventHandler(async (event) => {
  setHeader(event, 'cache-control', 'private, no-store')
  setHeader(event, 'referrer-policy', 'no-referrer')
  setHeader(event, 'x-robots-tag', 'noindex, nofollow')
  const query = getQuery(event)
  const input = callbackSchema.safeParse(query)
  if (query.error || !input.success) return sendRedirect(event, '/login?error=confirmation_failed', 303)
  try {
    const client = getUserDatabase(event)
    const { data, error } = input.data.code
      ? await client.auth.exchangeCodeForSession(input.data.code)
      : await client.auth.verifyOtp({ token_hash: input.data.token_hash!, type: input.data.type! })
    if (error || !data.user || !data.session) return sendRedirect(event, '/login?error=confirmation_failed', 303)
    const user = await getSessionUserFromClient(client, data.user.id)
    return sendRedirect(event, safeAuthRedirect(user.role, input.data.next), 303)
  }
  catch {
    // Callback URLs and provider errors can contain secrets. Never reflect them.
    return sendRedirect(event, '/login?error=confirmation_failed', 303)
  }
})
