import { z } from 'zod'
import {
  PRIORITY_LEVELS,
  REPORT_STATUSES,
  THREAT_CATEGORIES,
  USER_ROLES,
} from '../constants/domain'

export const userRoleSchema = z.enum(USER_ROLES)
export const threatCategorySchema = z.enum(THREAT_CATEGORIES)
export const reportStatusSchema = z.enum(REPORT_STATUSES)
export const priorityLevelSchema = z.enum(PRIORITY_LEVELS)
export const uuidSchema = z.uuid('ID harus berupa UUID yang valid.')

// No coercion: an empty coordinate field must never become the valid number zero.
export const latitudeSchema = z.number({ error: 'Lintang harus berupa angka.' })
  .finite('Lintang harus berupa angka terbatas.')
  .min(-90, 'Lintang minimal -90.')
  .max(90, 'Lintang maksimal 90.')

export const longitudeSchema = z.number({ error: 'Bujur harus berupa angka.' })
  .finite('Bujur harus berupa angka terbatas.')
  .min(-180, 'Bujur minimal -180.')
  .max(180, 'Bujur maksimal 180.')

export const coordinatesSchema = z.strictObject({
  latitude: latitudeSchema,
  longitude: longitudeSchema,
})

export const instantSchema = z.iso.datetime({
  offset: true,
  error: 'Waktu harus berupa tanggal ISO yang valid dengan zona waktu.',
})
