import { defineEventHandler, getRequestURL } from 'h3'
import { requireAdmin } from '../utils/auth'

export default defineEventHandler(async (event) => {
  const path = getRequestURL(event).pathname
  if (path === '/api/admin' || path.startsWith('/api/admin/') || path === '/admin' || path.startsWith('/admin/')) {
    await requireAdmin(event)
  }
})
