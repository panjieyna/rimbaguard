import { defineEventHandler } from 'h3'
import { requireAdmin } from '../../utils/auth'
import { getSettings } from '../../services/admin-service'

export default defineEventHandler(async (event) => getSettings(await requireAdmin(event)))
