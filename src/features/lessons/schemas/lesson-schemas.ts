import { z } from "zod"

const titleSchema = z.string().trim().min(2, "Ingresá al menos 2 caracteres.").max(120, "Máximo 120 caracteres.")
const descriptionSchema = z
  .string()
  .trim()
  .max(500, "Máximo 500 caracteres.")
  .optional()
  .or(z.literal(""))

export const createLessonSchema = z.object({
  moduleId: z.string().uuid(),
  title: titleSchema,
  description: descriptionSchema,
})
export type CreateLessonInput = z.infer<typeof createLessonSchema>

export const updateLessonSchema = z.object({
  lessonId: z.string().uuid(),
  title: titleSchema,
  description: descriptionSchema,
})
export type UpdateLessonInput = z.infer<typeof updateLessonSchema>

export const deleteLessonSchema = z.object({ lessonId: z.string().uuid() })
export type DeleteLessonInput = z.infer<typeof deleteLessonSchema>

export const reorderLessonsSchema = z.object({
  moduleId: z.string().uuid(),
  orderedIds: z.array(z.string().uuid()).min(1),
})
export type ReorderLessonsInput = z.infer<typeof reorderLessonsSchema>
