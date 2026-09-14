import { z } from "zod"

/**
 * URL-driven audit log filters, shared by `/admin/audit` and `/platform/audit`.
 * `z.iso.date()` rejects out-of-range calendar dates (e.g. `2026-13-45`) at
 * the edge instead of letting Postgres 22007 reach the page (L2).
 */
export const auditLogFiltersSchema = z.object({
  organizationId: z.guid().optional(),
  actor: z.string().trim().min(1).max(120).optional(),
  action: z.string().trim().min(1).max(100).optional(),
  entityType: z.string().trim().min(1).max(100).optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  page: z.coerce.number().int().min(1).optional(),
})
export type AuditLogFilters = z.infer<typeof auditLogFiltersSchema>

const filterFieldSchemas = {
  organizationId: auditLogFiltersSchema.shape.organizationId,
  actor: auditLogFiltersSchema.shape.actor,
  action: auditLogFiltersSchema.shape.action,
  entityType: auditLogFiltersSchema.shape.entityType,
  from: auditLogFiltersSchema.shape.from,
  to: auditLogFiltersSchema.shape.to,
  page: auditLogFiltersSchema.shape.page,
} as const

/**
 * Parses each filter independently so one invalid value (e.g. a malformed
 * `from` date) doesn't drop every other filter — including `organizationId`
 * on the platform page, which gates which org's log is shown (L3). Unlike
 * `auditLogFiltersSchema.safeParse` on the whole object, a single bad field
 * here is silently omitted rather than failing the entire result.
 */
export function parseAuditFilters(raw: Record<string, string | undefined>): AuditLogFilters {
  const result: AuditLogFilters = {}
  for (const key of Object.keys(filterFieldSchemas) as (keyof typeof filterFieldSchemas)[]) {
    const parsed = filterFieldSchemas[key].safeParse(raw[key])
    if (parsed.success && parsed.data !== undefined) {
      // @ts-expect-error -- each field schema's output matches its own key by construction
      result[key] = parsed.data
    }
  }
  return result
}
