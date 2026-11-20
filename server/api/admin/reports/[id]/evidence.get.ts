import { defineEventHandler, getQuery, getRouterParam, send, setHeaders } from 'h3'
import { z } from 'zod'
import { requireAdmin } from '../../../../utils/auth'
import { validateInput } from '../../../../utils/validation'
import { readAdminEvidence } from '../../../../services/admin-evidence'

export default defineEventHandler(async (event) => {
  const user = await requireAdmin(event)
  const id = validateInput(z.uuid(), getRouterParam(event, 'id'))
  const size = validateInput(z.enum(['thumbnail', 'full']).default('thumbnail'), getQuery(event).size)
  const image = await readAdminEvidence(event, user, id, size)
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
