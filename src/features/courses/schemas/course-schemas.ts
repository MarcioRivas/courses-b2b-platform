import { z } from "zod"

const titleSchema = z
  .string()
  .trim()
  .min(2, "Ingresá al menos 2 caracteres.")
  .max(150, "Máximo 150 caracteres.")

const descriptionSchema = z
  .string()
  .trim()
  .max(2000, "Máximo 2000 caracteres.")
  .optional()
  .or(z.literal(""))

const accessTypeSchema = z.enum(["FREE", "PRIVATE"])

export const createCourseSchema = z.object({
  title: titleSchema,
  description: descriptionSchema,
  accessType: accessTypeSchema,
})
export type CreateCourseInput = z.infer<typeof createCourseSchema>

export const updateCourseSchema = z.object({
  courseId: z.guid(),
  title: titleSchema,
  description: descriptionSchema,
  accessType: accessTypeSchema,
})
export type UpdateCourseInput = z.infer<typeof updateCourseSchema>

export const courseIdSchema = z.object({ courseId: z.guid() })
export type CourseIdInput = z.infer<typeof courseIdSchema>
