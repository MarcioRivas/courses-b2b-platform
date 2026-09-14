import { z } from "zod"

const titleSchema = z.string().trim().min(2, "Ingresá al menos 2 caracteres.").max(120, "Máximo 120 caracteres.")
const descriptionSchema = z
  .string()
  .trim()
  .max(500, "Máximo 500 caracteres.")
  .optional()
  .or(z.literal(""))

export const createModuleSchema = z.object({
  courseId: z.guid(),
  title: titleSchema,
  description: descriptionSchema,
})
export type CreateModuleInput = z.infer<typeof createModuleSchema>

export const updateModuleSchema = z.object({
  moduleId: z.guid(),
  title: titleSchema,
  description: descriptionSchema,
})
export type UpdateModuleInput = z.infer<typeof updateModuleSchema>

export const deleteModuleSchema = z.object({ moduleId: z.guid() })
export type DeleteModuleInput = z.infer<typeof deleteModuleSchema>

export const reorderModulesSchema = z.object({
  courseId: z.guid(),
  orderedIds: z.array(z.guid()).min(1),
})
export type ReorderModulesInput = z.infer<typeof reorderModulesSchema>

/**
 * Two shapes (Phase 5 enables QUIZ_PASSED): MODULE_COMPLETED needs the
 * prerequisite module; QUIZ_PASSED needs the assessment + a 0..100 minimum
 * score. Mirrors the DB's `module_dependencies_shape_check`.
 */
export const upsertDependencySchema = z.discriminatedUnion("condition", [
  z.object({
    condition: z.literal("MODULE_COMPLETED"),
    moduleId: z.guid(),
    dependsOnModuleId: z.guid(),
  }),
  z.object({
    condition: z.literal("QUIZ_PASSED"),
    moduleId: z.guid(),
    assessmentId: z.guid(),
    minScore: z.coerce.number().int().min(0).max(100),
  }),
])
export type UpsertDependencyInput = z.infer<typeof upsertDependencySchema>

export const deleteDependencySchema = z.object({ dependencyId: z.guid() })
export type DeleteDependencyInput = z.infer<typeof deleteDependencySchema>
