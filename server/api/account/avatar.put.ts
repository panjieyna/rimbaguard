import { defineEventHandler } from 'h3'
import type { AccountUserResponse } from '../../../shared/types/domain'
import { avatarUploadSchema } from '../../../shared/schemas/account'
import { requireSession } from '../../utils/auth'
import { enforceRateLimit } from '../../utils/rate-limit'
import { validatedBody } from '../../utils/validation'
import { saveAvatar } from '../../services/account-service'

export default defineEventHandler(async (event): Promise<AccountUserResponse> => {
  const user = await requireSession(event)
  await enforceRateLimit(event, 'account:avatar', user.id, 10, 600)
  const input = await validatedBody(event, avatarUploadSchema)
  return { user: await saveAvatar(event, user, input.image) }
})
