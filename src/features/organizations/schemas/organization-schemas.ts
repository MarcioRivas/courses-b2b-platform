import { z } from "zod"

const orgNameSchema = z
  .string()
  .trim()
  .min(2, "Ingresá al menos 2 caracteres.")
  .max(120, "Máximo 120 caracteres.")

const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2, "Ingresá al menos 2 caracteres.")
  .max(60, "Máximo 60 caracteres.")
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "El slug debe ser kebab-case (minúsculas, números y guiones).")

export const createOrganizationSchema = z.object({
  name: orgNameSchema,
  slug: slugSchema,
})
export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>

export const updateOrganizationSchema = z.object({
  organizationId: z.string().uuid(),
  name: orgNameSchema,
})
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>

export const setOrganizationStatusSchema = z.object({
  organizationId: z.string().uuid(),
  status: z.enum(["ACTIVE", "INACTIVE"]),
})
export type SetOrganizationStatusInput = z.infer<typeof setOrganizationStatusSchema>

export const orgSettingsSchema = z.object({
  timezone: z.string().min(1, "Seleccioná una zona horaria."),
  defaultPassingScore: z
    .number()
    .int("Ingresá un número entero.")
    .min(0, "Mínimo 0.")
    .max(100, "Máximo 100."),
})
export type OrgSettingsInput = z.infer<typeof orgSettingsSchema>

export const scoreRangeSchema = z
  .object({
    id: z.string().uuid().optional(),
    label: z.string().trim().min(1, "Ingresá una etiqueta.").max(40, "Máximo 40 caracteres."),
    minScore: z.number().int().min(0, "Mínimo 0.").max(100, "Máximo 100."),
    maxScore: z.number().int().min(0, "Mínimo 0.").max(100, "Máximo 100."),
    isPassing: z.boolean(),
  })
  .refine((data) => data.minScore <= data.maxScore, {
    message: "El mínimo debe ser menor o igual al máximo.",
    path: ["maxScore"],
  })
export type ScoreRangeInput = z.infer<typeof scoreRangeSchema>

export const deleteScoreRangeSchema = z.object({ id: z.string().uuid() })
export type DeleteScoreRangeInput = z.infer<typeof deleteScoreRangeSchema>
