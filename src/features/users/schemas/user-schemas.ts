import { z } from "zod"

export const membershipRoleSchema = z.enum(["ADMIN", "PROFESSOR", "STUDENT"])
export type MembershipRole = z.infer<typeof membershipRoleSchema>

export const membershipStatusSchema = z.enum(["ACTIVE", "INACTIVE"])
export type MembershipStatus = z.infer<typeof membershipStatusSchema>

/** URL-driven member directory filters (role/status/search/page). */
export const memberFiltersSchema = z.object({
  role: membershipRoleSchema.optional(),
  status: membershipStatusSchema.optional(),
  search: z.string().trim().min(1).max(120).optional(),
  page: z.coerce.number().int().min(1).optional(),
})
export type MemberFilters = z.infer<typeof memberFiltersSchema>

/** Thin wrapper input over `set_membership_role` (P1 RPC, D24). */
export const setMemberRoleSchema = z.object({
  membershipId: z.string().uuid(),
  organizationId: z.string().uuid(),
  role: membershipRoleSchema,
})
export type SetMemberRoleInput = z.infer<typeof setMemberRoleSchema>

/** Thin wrapper input over `set_membership_status` (P1 RPC, D24/D29). */
export const setMemberStatusSchema = z.object({
  membershipId: z.string().uuid(),
  organizationId: z.string().uuid(),
  status: membershipStatusSchema,
})
export type SetMemberStatusInput = z.infer<typeof setMemberStatusSchema>
