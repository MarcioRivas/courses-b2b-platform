import { z } from "zod"

/** `<input type="datetime-local">` value: "YYYY-MM-DDTHH:mm", empty string means unset. */
const optionalDateTimeLocal = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Fecha inválida.")
  .optional()
  .or(z.literal(""))

const nameSchema = z.string().trim().min(2, "Ingresá al menos 2 caracteres.").max(120, "Máximo 120 caracteres.")

export const createOfferingSchema = z.object({
  courseId: z.guid(),
  name: nameSchema,
  groupId: z.guid().optional(),
  startsAt: optionalDateTimeLocal,
  endsAt: optionalDateTimeLocal,
  /** Edition to copy content from; omitted = empty edition. */
  fromOfferingId: z.guid().optional(),
})
export type CreateOfferingInput = z.infer<typeof createOfferingSchema>

export const updateOfferingSchema = z.object({
  offeringId: z.guid(),
  name: nameSchema,
  groupId: z.guid().optional(),
  startsAt: optionalDateTimeLocal,
  endsAt: optionalDateTimeLocal,
})
export type UpdateOfferingInput = z.infer<typeof updateOfferingSchema>

export const setOfferingStatusSchema = z.object({
  offeringId: z.guid(),
  status: z.enum(["ACTIVE", "CANCELLED"]),
})
export type SetOfferingStatusInput = z.infer<typeof setOfferingStatusSchema>

export const upsertModuleScheduleSchema = z.object({
  offeringId: z.guid(),
  moduleId: z.guid(),
  availableFrom: optionalDateTimeLocal,
  availableUntil: optionalDateTimeLocal,
})
export type UpsertModuleScheduleInput = z.infer<typeof upsertModuleScheduleSchema>

export const syncEnrollmentsSchema = z.object({ offeringId: z.guid() })
export type SyncEnrollmentsInput = z.infer<typeof syncEnrollmentsSchema>

export const offeringProfessorSchema = z.object({
  offeringId: z.guid(),
  userId: z.guid(),
})
export type OfferingProfessorInput = z.infer<typeof offeringProfessorSchema>

export const searchAssignableProfessorsSchema = z.object({
  offeringId: z.guid(),
  q: z.string().trim().min(2).max(100),
})
export type SearchAssignableProfessorsInput = z.infer<typeof searchAssignableProfessorsSchema>
