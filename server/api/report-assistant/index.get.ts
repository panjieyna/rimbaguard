import { defineEventHandler } from 'h3'
import { requireSession } from '../../utils/auth'
import { getAssistantDraft } from '../../services/report-assistant-service'
export default defineEventHandler(async event => getAssistantDraft(event,await requireSession(event)))
