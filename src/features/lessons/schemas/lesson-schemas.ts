import { z } from "zod"

const titleSchema = z.string().trim().min(2, "Ingresá al menos 2 caracteres.").max(120, "Máximo 120 caracteres.")
const descriptionSchema = z
  .string()
  .trim()
  .max(500, "Máximo 500 caracteres.")
  .optional()
  .or(z.literal(""))

export const createLessonSchema = z.object({
  moduleId: z.guid(),
  title: titleSchema,
  description: descriptionSchema,
})
export type CreateLessonInput = z.infer<typeof createLessonSchema>

export const updateLessonSchema = z.object({
  lessonId: z.guid(),
  title: titleSchema,
  description: descriptionSchema,
})
export type UpdateLessonInput = z.infer<typeof updateLessonSchema>

export const deleteLessonSchema = z.object({ lessonId: z.guid() })
export type DeleteLessonInput = z.infer<typeof deleteLessonSchema>

export const reorderLessonsSchema = z.object({
  moduleId: z.guid(),
  orderedIds: z.array(z.guid()).min(1),
})
export type ReorderLessonsInput = z.infer<typeof reorderLessonsSchema>
