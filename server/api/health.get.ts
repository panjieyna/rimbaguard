import { defineEventHandler } from 'h3'
import { getServerEnvironment } from '../utils/config'

export default defineEventHandler(() => {
  const environment = getServerEnvironment()
  return {
    mode: environment.mode,
    services: {
      supabase: environment.mode === 'configured' ? 'configured' : 'unavailable',
      gemini: environment.geminiApiKey ? 'configured' : 'unavailable',
    },
  }
})
