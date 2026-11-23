import { defineEventHandler, getRouterParam, send, setHeaders } from 'h3'
import { z } from 'zod'
import { requireSession } from '../../../utils/auth'
import { validateInput } from '../../../utils/validation'
import { readReportEvidence } from '../../../services/report-evidence'

export default defineEventHandler(async (event) => {
  const user = await requireSession(event)
  const id = validateInput(z.uuid(), getRouterParam(event, 'id'))
  const image = await readReportEvidence(event, user, id, 'thumbnail')
  setHeaders(event, {
    'content-type': image.mime,
    'content-length': image.bytes.byteLength,
    'cache-control': 'private, no-store',
    'x-content-type-options': 'nosniff',
    'cross-origin-resource-policy': 'same-origin',
    'referrer-policy': 'no-referrer',
    'x-robots-tag': 'noindex, nofollow',
  })
  return send(event, image.bytes)
})
