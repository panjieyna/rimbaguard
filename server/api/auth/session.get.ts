import { defineEventHandler } from 'h3'
import type { SessionResponse } from '../../../shared/types/domain'
import { getOptionalSession } from '../../utils/auth'

export default defineEventHandler(async (event): Promise<SessionResponse> => {
  const user = await getOptionalSession(event)
  return { user, ...(user && process.env.RIMBAGUARD_TEST_USER_ID === user.id ? { simulationMode: true as const } : {}) }
})
