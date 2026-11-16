import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  COMPLETENESS_RULES, NEARBY_RADIUS_KM, NEARBY_RULES, NEARBY_WINDOW_DAYS, RECENCY_RULES, SCORING_VERSION, SCORING_WEIGHTS, THREAT_SEVERITY,
} from '../../shared/constants/scoring'

// The database is the only calculator. These checks keep the rules shown to
// officers identical to the rules migration 005 actually applies.
const sql = readFileSync(new URL('../../supabase/migrations/20261115000500_priority.sql', import.meta.url), 'utf8').replace(/\s+/g, ' ')

describe('scoring v1 display contract', () => {
  it('uses the same version identifier', () => {
    expect(sql).toContain(`select '${SCORING_VERSION}'::text`)
  })

  it('uses the same weights and thresholds', () => {
    expect(sql).toContain(`round(p_severity * ${SCORING_WEIGHTS.severity} + p_completeness * ${SCORING_WEIGHTS.completeness} + p_recency * ${SCORING_WEIGHTS.recency.toFixed(2)} + p_nearby * ${SCORING_WEIGHTS.nearby.toFixed(2)}, 4)`)
    expect(sql).toContain(`when p_total >= 75 then 'high' when p_total >= 45 then 'medium' else 'low'`)
  })

  it('uses the same severity for every category', () => {
    for (const [category, score] of Object.entries(THREAT_SEVERITY)) {
      expect(sql).toContain(`when '${category}'::public.threat_category then ${score}`)
    }
  })

  it('uses the same completeness rules', () => {
    expect(COMPLETENESS_RULES.map(rule => rule.points)).toEqual([25, 25, 20, 20, 10])
    expect(sql).toContain(`>= 80 then 25 else 0`)
    expect(sql).toContain(`char_length(btrim(coalesce(p_location_name, ''))) >= 3 then 10 else 0`)
  })

  it('uses the same recency boundaries', () => {
    const scores = RECENCY_RULES.map(rule => rule.score)
    expect(scores).toEqual([100, 85, 65, 40, 20])
    for (const [hours, score] of [[6, 100], [24, 85], [72, 65], [168, 40]] as const) {
      expect(sql).toContain(`<= interval '${hours} hours' then ${score}`)
    }
    expect(sql).toContain(`else 20 end)::numeric`)
  })

  it('uses the same nearby definition and mapping', () => {
    expect(NEARBY_RULES.map(rule => rule.score)).toEqual([0, 40, 70, 100])
    expect(sql).toContain(`when p_count >= 3 then 100 when p_count = 2 then 70 when p_count = 1 then 40 else 0`)
    expect(sql).toContain(`<= ${NEARBY_RADIUS_KM.toFixed(1)}`)
    expect(sql).toContain(`interval '${NEARBY_WINDOW_DAYS} days'`)
  })
})
