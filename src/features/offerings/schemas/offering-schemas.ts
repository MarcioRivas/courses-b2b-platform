import { z } from "zod"

/** `<input type="datetime-local">` value: "YYYY-MM-DDTHH:mm", empty string means unset. */
const optionalDateTimeLocal = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Fecha inválida.")
  .optional()
  .or(z.literal(""))

const nameSchema = z.string().trim().min(2, "Ingresá al menos 2 caracteres.").max(120, "Máximo 120 caracteres.")

export const createOfferingSchema = z.object({
  courseId: z.string().uuid(),
  name: nameSchema,
  groupId: z.string().uuid().optional(),
  startsAt: optionalDateTimeLocal,
  endsAt: optionalDateTimeLocal,
})
export type CreateOfferingInput = z.infer<typeof createOfferingSchema>

export const updateOfferingSchema = z.object({
  offeringId: z.string().uuid(),
  name: nameSchema,
  groupId: z.string().uuid().optional(),
  startsAt: optionalDateTimeLocal,
  endsAt: optionalDateTimeLocal,
})
export type UpdateOfferingInput = z.infer<typeof updateOfferingSchema>

export const setOfferingStatusSchema = z.object({
  offeringId: z.string().uuid(),
  status: z.enum(["ACTIVE", "CANCELLED"]),
})
export type SetOfferingStatusInput = z.infer<typeof setOfferingStatusSchema>

export const upsertModuleScheduleSchema = z.object({
  offeringId: z.string().uuid(),
  moduleId: z.string().uuid(),
  availableFrom: optionalDateTimeLocal,
  availableUntil: optionalDateTimeLocal,
})
export type UpsertModuleScheduleInput = z.infer<typeof upsertModuleScheduleSchema>

export const syncEnrollmentsSchema = z.object({ offeringId: z.string().uuid() })
export type SyncEnrollmentsInput = z.infer<typeof syncEnrollmentsSchema>
