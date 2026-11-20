import { defineEventHandler } from 'h3'
import type { PasswordChangeResponse } from '../../../shared/types/domain'
import { passwordChangeSchema } from '../../../shared/schemas/account'
import { requireSession } from '../../utils/auth'
import { enforceRateLimit } from '../../utils/rate-limit'
import { validatedBody } from '../../utils/validation'
import { changePassword } from '../../services/account-service'

export default defineEventHandler(async (event): Promise<PasswordChangeResponse> => {
  const user = await requireSession(event)
  // Each attempt checks the current password, so attempts are limited per account.
  await enforceRateLimit(event, 'account:password', user.id, 5, 900)
  const input = await validatedBody(event, passwordChangeSchema)
  return changePassword(event, user, input)
})
