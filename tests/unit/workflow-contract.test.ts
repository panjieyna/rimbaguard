import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ADMIN_STATUS_TRANSITIONS, PUBLISHABLE_STATUSES, REPORTER_NOTE_STATUSES } from '../../shared/constants/workflow'

// The database enforces the workflow. These checks keep the actions the UI
// offers identical to what migrations 001 and 006 accept.
const read = (name: string) => readFileSync(new URL(`../../supabase/migrations/${name}`, import.meta.url), 'utf8').replace(/\s+/g, ' ')
const foundation = read('20261114000100_foundation.sql')
const workflow = read('20261115000600_admin_workflow.sql')
const list = (values: readonly string[]) => values.map(value => `'${value}'`).join(', ')

describe('officer workflow contract', () => {
  it('offers exactly the transitions the status RPC accepts', () => {
    expect(foundation).toContain(`(v_report.status in (${list(['pending_verification', 'analysis_failed'])}) and p_new_status in (${list(ADMIN_STATUS_TRANSITIONS.pending_verification!)}))`)
    expect(ADMIN_STATUS_TRANSITIONS.analysis_failed).toEqual(ADMIN_STATUS_TRANSITIONS.pending_verification)
    expect(foundation).toContain(`(v_report.status = 'verified' and p_new_status = '${ADMIN_STATUS_TRANSITIONS.verified![0]}')`)
    expect(foundation).toContain(`(v_report.status = 'in_progress' and p_new_status = '${ADMIN_STATUS_TRANSITIONS.in_progress![0]}')`)
    expect(Object.keys(ADMIN_STATUS_TRANSITIONS).sort()).toEqual(['analysis_failed', 'in_progress', 'pending_verification', 'verified'])
  })

  it('requires the same reporter notes as the database', () => {
    expect(foundation).toContain(`if p_new_status in (${list(REPORTER_NOTE_STATUSES)}) and coalesce(char_length(btrim(p_note)), 0) < 5`)
  })

  it('publishes only the statuses the publication RPC accepts', () => {
    expect(workflow).toContain(`if v_report.status not in (${list(PUBLISHABLE_STATUSES)}) then`)
    expect(workflow).toContain(`char_length(v_summary) not between 10 and 500`)
    expect(workflow).toContain(`message = 'simulation_not_publishable'`)
  })
})
