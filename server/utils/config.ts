import { useRuntimeConfig } from '#imports'
import { resolveEnvironment } from './environment'

export function getServerEnvironment() {
  const config = useRuntimeConfig()
  return resolveEnvironment({
    supabaseUrl: process.env.SUPABASE_URL || config.supabaseUrl,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || config.supabaseAnonKey,
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || config.supabaseServiceRoleKey,
    geminiApiKey: process.env.GEMINI_API_KEY || config.geminiApiKey,
    geminiModel: process.env.GEMINI_MODEL || config.geminiModel,
    appUrl: config.public.appUrl,
    setupMode: process.env.RIMBAGUARD_SETUP_MODE === 'true',
  }, import.meta.dev)
}
