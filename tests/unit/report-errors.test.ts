import { describe, expect, it } from 'vitest'
import { throwReportDatabaseError } from '../../server/utils/report-errors'

describe('report database error boundary', () => {
  it.each(['PT409', '40001'])('returns a conflict for %s without reflecting provider content', code => {
    try { throwReportDatabaseError({ code, message: 'private provider detail' }) }
    catch (error) {
      expect(error).toMatchObject({ statusCode: 409, data: { error: { code: 'REPORT_CONFLICT' } } })
      expect(JSON.stringify(error)).not.toContain('private provider detail')
      return
    }
    throw new Error('Expected a safe conflict response.')
  })

  it('fails closed with an unavailable response for an unknown provider failure', () => {
    try { throwReportDatabaseError({ code: 'UNKNOWN', message: 'private provider detail' }) }
    catch (error) {
      expect(error).toMatchObject({ statusCode: 503, data: { error: { code: 'DATABASE_UNAVAILABLE' } } })
      expect(JSON.stringify(error)).not.toContain('private provider detail')
      return
    }
    throw new Error('Expected a safe unavailable response.')
  })
})
