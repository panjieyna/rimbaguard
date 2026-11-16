import type { PriorityLevel } from '../../shared/types/domain'

export interface ThreatMapPoint {
  id: string
  latitude: number
  longitude: number
  priority: PriorityLevel | null
  /** Short accessible label such as the report code and category. */
  label: string
}

export type MapFilterValues = Partial<Record<'category' | 'priority' | 'status' | 'from' | 'to' | 'dataset', string>>
