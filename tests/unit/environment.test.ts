import { describe, expect, it } from 'vitest'
import { EnvironmentError, resolveEnvironment } from '../../server/utils/environment'

const setup = { appUrl: 'http://localhost:3000', setupMode: true }
const configured = { appUrl: 'https://rimbaguard.example', setupMode: false, supabaseUrl: 'https://project.supabase.co', supabaseAnonKey: 'public-example-key', supabaseServiceRoleKey: 'private-example-key' }

describe('server environment validation', () => {
  it('allows explicit empty local setup without reporting service availability', () => {
    expect(resolveEnvironment(setup, true).mode).toBe('setup')
  })
  it('does not silently accept missing credentials', () => {
    expect(() => resolveEnvironment({ ...setup, setupMode: false }, true)).toThrow(EnvironmentError)
  })
  it('rejects partial configuration even in local setup', () => {
    expect(() => resolveEnvironment({ ...setup, supabaseUrl: 'https://project.supabase.co' }, true)).toThrow(EnvironmentError)
  })
  it('rejects setup mode and missing credentials in production', () => {
    expect(() => resolveEnvironment(setup, false)).toThrow(EnvironmentError)
    expect(() => resolveEnvironment({ ...configured, setupMode: true }, false)).toThrow(EnvironmentError)
  })
  it('accepts complete production configuration without copying secrets to public fields', () => {
    const values = resolveEnvironment(configured, false)
    expect(values.mode).toBe('configured')
    expect(values).not.toHaveProperty('public')
  })
  it('rejects insecure remote URLs and equal privilege keys', () => {
    expect(() => resolveEnvironment({ ...configured, supabaseUrl: 'http://remote.example' }, false)).toThrow()
    expect(() => resolveEnvironment({ ...configured, supabaseServiceRoleKey: configured.supabaseAnonKey }, false)).toThrow()
  })
  it('does not include rejected credential values in errors', () => {
    const secret = 'sensitive-value-never-return'
    try { resolveEnvironment({ ...setup, supabaseAnonKey: secret }, true) }
    catch (error) { expect(String(error)).not.toContain(secret) }
  })
})
