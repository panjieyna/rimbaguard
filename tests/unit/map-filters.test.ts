import { describe, expect, it } from 'vitest'
import { adminMapFiltersSchema, publicMapFiltersSchema, wibDateRange } from '../../shared/schemas/map'

describe('map filter contract', () => {
  it('treats empty form controls as no filter and defaults the page', () => {
    expect(publicMapFiltersSchema.parse({ category: '', priority: '', status: '', from: '', to: '' })).toEqual({ page: 1 })
    expect(adminMapFiltersSchema.parse({})).toEqual({ page: 1, dataset: 'all' })
  })

  it('accepts every supported filter value', () => {
    expect(adminMapFiltersSchema.parse({
      category: 'forest_fire', priority: 'none', status: 'pending_verification', from: '2026-11-01', to: '2026-11-15', dataset: 'simulation', page: '2',
    })).toEqual({ category: 'forest_fire', priority: 'none', status: 'pending_verification', from: '2026-11-01', to: '2026-11-15', dataset: 'simulation', page: 2 })
  })

  it('never lets the public map request unpublished workflow states or simulation data', () => {
    expect(publicMapFiltersSchema.safeParse({ status: 'pending_verification' }).success).toBe(false)
    expect(publicMapFiltersSchema.safeParse({ status: 'rejected' }).success).toBe(false)
    expect(publicMapFiltersSchema.safeParse({ dataset: 'simulation' }).success).toBe(false)
    expect(publicMapFiltersSchema.parse({ status: 'resolved' }).status).toBe('resolved')
  })

  it.each([
    [{ category: 'deforestation' }],
    [{ priority: 'urgent' }],
    [{ from: '2026-02-30' }],
    [{ from: '15-11-2026' }],
    [{ from: '2026-11-16', to: '2026-11-15' }],
    [{ page: '0' }],
    [{ page: '201' }],
    [{ category: ['forest_fire', 'land_clearing'] }],
    [{ unexpected: 'value' }],
  ])('rejects invalid input %o', (input) => {
    expect(adminMapFiltersSchema.safeParse(input).success).toBe(false)
  })

  it('converts inclusive WIB calendar days into a half-open instant range', () => {
    expect(wibDateRange('2026-11-01', '2026-11-15')).toEqual({ from: '2026-11-01T00:00:00+07:00', to: '2026-11-16T00:00:00+07:00' })
    expect(wibDateRange(undefined, '2026-12-31')).toEqual({ from: null, to: '2027-01-01T00:00:00+07:00' })
    expect(wibDateRange('2028-02-28', '2028-02-28')).toEqual({ from: '2028-02-28T00:00:00+07:00', to: '2028-02-29T00:00:00+07:00' })
    expect(wibDateRange()).toEqual({ from: null, to: null })
    expect(new Date(wibDateRange(undefined, '2026-11-15').to!).toISOString()).toBe('2026-11-15T17:00:00.000Z')
  })
})
