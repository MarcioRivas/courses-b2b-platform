import { z } from "zod"

const titleSchema = z.string().trim().min(2, "Ingresá al menos 2 caracteres.").max(150, "Máximo 150 caracteres.")
const descriptionSchema = z.string().trim().max(2000, "Máximo 2000 caracteres.").optional().or(z.literal(""))
const instructionsSchema = z.string().trim().max(10000, "Máximo 10000 caracteres.").optional().or(z.literal(""))
export const assessmentKindSchema = z.enum(["QUIZ", "TASK", "EXAM"])
/** `<input type="datetime-local">` value, empty string means unset. */
const optionalDateTimeLocal = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Fecha inválida.")
  .optional()
  .or(z.literal(""))

/**
 * Numeric fields stay string-typed end to end (no `z.coerce`): this schema is
 * bound to a react-hook-form `<input type="number">`, and `zodResolver`
 * requires the form's value type and the schema's output type to match.
 * `Number(...)` happens once, server-side (`configToColumns`).
 */
const requiredPercentString = z
  .string()
  .regex(/^\d{1,3}$/, "Ingresá un número entero.")
  .refine((v) => Number(v) <= 100, "Máximo 100.")
const optionalPositiveIntString = z
  .string()
  .regex(/^\d+$/, "Ingresá un número entero positivo.")
  .optional()
  .or(z.literal(""))

/**
 * Wizard step 1 — configuration only, no questions/instructions. The kind is
 * fixed at creation; it travels with the values so the per-kind rules apply:
 * QUIZ is untimed with no window; TASK needs 1–10 files and a deadline; EXAM
 * needs a duration and a full window.
 */
export const assessmentConfigSchema = z
  .object({
    kind: assessmentKindSchema,
    title: titleSchema,
    description: descriptionSchema,
    passingScore: requiredPercentString,
    // Empty string = unlimited attempts (NULL in the DB, B3). EXAM only.
    maxAttempts: optionalPositiveIntString,
    durationMinutes: optionalPositiveIntString,
    availableFrom: optionalDateTimeLocal,
    availableUntil: optionalDateTimeLocal,
    maxFiles: optionalPositiveIntString,
    allowLateSubmissions: z.boolean(),
  })
  .superRefine((data, ctx) => {
    if (data.kind === "TASK") {
      const maxFiles = Number(data.maxFiles)
      if (!data.maxFiles || maxFiles < 1 || maxFiles > 10) {
        ctx.addIssue({ code: "custom", path: ["maxFiles"], message: "Elegí entre 1 y 10 archivos." })
      }
      if (!data.availableUntil) {
        ctx.addIssue({ code: "custom", path: ["availableUntil"], message: "Las tareas requieren una fecha límite." })
      }
    }
    if (data.kind === "EXAM") {
      if (!data.durationMinutes) {
        ctx.addIssue({ code: "custom", path: ["durationMinutes"], message: "Los exámenes requieren duración." })
      }
      if (!data.availableFrom || !data.availableUntil) {
        ctx.addIssue({ code: "custom", path: ["availableUntil"], message: "Los exámenes requieren una ventana de disponibilidad." })
      }
    }
    if (data.kind !== "QUIZ" && data.availableFrom && data.availableUntil && data.availableFrom >= data.availableUntil) {
      ctx.addIssue({ code: "custom", path: ["availableUntil"], message: "La fecha de fin debe ser posterior al inicio." })
    }
  })
export type AssessmentConfigInput = z.infer<typeof assessmentConfigSchema>

export const createAssessmentBlockSchema = z.object({
  lessonId: z.guid(),
  isRequired: z.boolean(),
  config: assessmentConfigSchema,
})
export type CreateAssessmentBlockInput = z.infer<typeof createAssessmentBlockSchema>

export const createExamSchema = z.object({
  offeringId: z.guid(),
  config: assessmentConfigSchema,
})
export type CreateExamInput = z.infer<typeof createExamSchema>

export const updateAssessmentConfigSchema = z.object({
  assessmentId: z.guid(),
  config: assessmentConfigSchema,
  /** QUIZ/TASK only: the owning block's "required" flag, edited alongside the config. */
  isRequired: z.boolean().optional(),
})
export type UpdateAssessmentConfigInput = z.infer<typeof updateAssessmentConfigSchema>

export const updateTaskInstructionsSchema = z.object({
  assessmentId: z.guid(),
  instructions: instructionsSchema,
})
export type UpdateTaskInstructionsInput = z.infer<typeof updateTaskInstructionsSchema>

export const publishAssessmentSchema = z.object({ assessmentId: z.guid() })
export type PublishAssessmentInput = z.infer<typeof publishAssessmentSchema>

export const deleteAssessmentSchema = z.object({ assessmentId: z.guid() })
export type DeleteAssessmentInput = z.infer<typeof deleteAssessmentSchema>

export const extendWindowSchema = z.object({
  assessmentId: z.guid(),
  newUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Fecha inválida."),
})
export type ExtendWindowInput = z.infer<typeof extendWindowSchema>
