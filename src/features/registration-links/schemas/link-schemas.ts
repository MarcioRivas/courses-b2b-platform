import { z } from "zod"

/** Superset of `membership_role` — ADMIN is offered client-side only for platform admins (D23). */
export const linkRoleSchema = z.enum(["STUDENT", "PROFESSOR", "ADMIN"])
export type LinkRole = z.infer<typeof linkRoleSchema>

export const createLinkSchema = z.object({
  organizationId: z.string().uuid(),
  label: z.string().trim().min(1, "Ingresá una etiqueta.").max(120, "Máximo 120 caracteres."),
  role: linkRoleSchema,
  /** `YYYY-MM-DD` from a date input; the action converts it to end-of-day ISO. */
  expiresAt: z.string().refine((value) => !Number.isNaN(Date.parse(value)), "Fecha inválida."),
})
export type CreateLinkInput = z.infer<typeof createLinkSchema>

export const toggleLinkSchema = z.object({
  linkId: z.string().uuid(),
  organizationId: z.string().uuid(),
  isActive: z.boolean(),
})
export type ToggleLinkInput = z.infer<typeof toggleLinkSchema>

export const revokeLinkSchema = z.object({
  linkId: z.string().uuid(),
  organizationId: z.string().uuid(),
})
export type RevokeLinkInput = z.infer<typeof revokeLinkSchema>
