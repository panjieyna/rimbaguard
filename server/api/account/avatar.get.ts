import { defineEventHandler, getQuery, send, setHeaders } from 'h3'
import { z } from 'zod'
import { requireSession } from '../../utils/auth'
import { validateInput } from '../../utils/validation'
import { readAvatar } from '../../services/account-service'

export default defineEventHandler(async (event) => {
  await requireSession(event)
  const version = validateInput(z.uuid().optional(), getQuery(event).v)
  const bytes = await readAvatar(event, version)
  setHeaders(event, {
    'content-type': 'image/webp',
    'content-length': bytes.byteLength,
    // Every upload gets a new URL and an old version answers 404, so the
    // browser may keep this private copy instead of downloading it on every page.
    'cache-control': 'private, max-age=86400',
    'x-content-type-options': 'nosniff',
    'cross-origin-resource-policy': 'same-origin',
    'referrer-policy': 'no-referrer',
    'x-robots-tag': 'noindex, nofollow',
  })
  return send(event, bytes)
})
