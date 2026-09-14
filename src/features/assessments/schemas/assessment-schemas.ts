import { z } from "zod"

const titleSchema = z.string().trim().min(2, "Ingresá al menos 2 caracteres.").max(150, "Máximo 150 caracteres.")
const descriptionSchema = z.string().trim().max(2000, "Máximo 2000 caracteres.").optional().or(z.literal(""))
const kindSchema = z.enum(["QUIZ", "TASK", "EXAM"])
/** `<input type="datetime-local">` value, empty string means unset. */
const optionalDateTimeLocal = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Fecha inválida.")
  .optional()
  .or(z.literal(""))

export const createAssessmentSchema = z.object({
  courseId: z.guid(),
  title: titleSchema,
  kind: kindSchema,
})
export type CreateAssessmentInput = z.infer<typeof createAssessmentSchema>

/**
 * Kind defaults (B3, D12) applied when creating an assessment or switching
 * kind: QUIZ is always unlimited/untimed/no-window; TASK gets one attempt
 * with an optional window; EXAM gets one attempt and requires the window +
 * duration to be filled in by the professor (enforced by `updateAssessmentSchema`).
 */
export function assessmentKindDefaults(kind: z.infer<typeof kindSchema>): {
  maxAttempts: number | null
  durationMinutes: number | null
  availableFrom: string
  availableUntil: string
} {
  if (kind === "QUIZ") {
    return { maxAttempts: null, durationMinutes: null, availableFrom: "", availableUntil: "" }
  }
  return { maxAttempts: 1, durationMinutes: null, availableFrom: "", availableUntil: "" }
}

/**
 * Numeric fields stay string-typed end to end (no `z.coerce`, unlike
 * `setAssessmentQuestionsSchema` below): this schema is bound to a
 * react-hook-form `<input type="number">`, and `zodResolver` requires the
 * form's value type and the schema's parsed (output) type to match — coercion
 * would make them diverge (`unknown` in, `number` out) and break the
 * resolver's generic. `Number(...)` happens once, server-side, in
 * `updateAssessment`.
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

const baseUpdateFields = {
  assessmentId: z.guid(),
  title: titleSchema,
  description: descriptionSchema,
  kind: kindSchema,
  passingScore: requiredPercentString,
  // Empty string = unlimited attempts (NULL in the DB, B3).
  maxAttempts: optionalPositiveIntString,
  durationMinutes: optionalPositiveIntString,
  availableFrom: optionalDateTimeLocal,
  availableUntil: optionalDateTimeLocal,
}

export const updateAssessmentSchema = z
  .object(baseUpdateFields)
  .superRefine((data, ctx) => {
    if (data.kind === "QUIZ") {
      return
    }
    if (data.kind === "EXAM") {
      if (!data.durationMinutes) {
        ctx.addIssue({ code: "custom", path: ["durationMinutes"], message: "Los exámenes requieren duración." })
      }
      if (!data.availableFrom || !data.availableUntil) {
        ctx.addIssue({ code: "custom", path: ["availableUntil"], message: "Los exámenes requieren una ventana de disponibilidad." })
      }
    }
    if (data.availableFrom && data.availableUntil && data.availableFrom >= data.availableUntil) {
      ctx.addIssue({ code: "custom", path: ["availableUntil"], message: "La fecha de fin debe ser posterior al inicio." })
    }
  })
export type UpdateAssessmentInput = z.infer<typeof updateAssessmentSchema>

export const publishAssessmentSchema = z.object({ assessmentId: z.guid() })
export type PublishAssessmentInput = z.infer<typeof publishAssessmentSchema>

export const deleteAssessmentSchema = z.object({ assessmentId: z.guid() })
export type DeleteAssessmentInput = z.infer<typeof deleteAssessmentSchema>

const fixedQuestionSchema = z.object({
  questionId: z.guid(),
  points: z.coerce.number().positive("Los puntos deben ser mayores a 0.").max(1000),
})

export const setAssessmentQuestionsSchema = z.object({
  assessmentId: z.guid(),
  fixedQuestions: z.array(fixedQuestionSchema).max(200),
  randomBankId: z.guid().optional(),
  randomCount: z.coerce.number().int().positive().optional(),
})
export type SetAssessmentQuestionsInput = z.infer<typeof setAssessmentQuestionsSchema>

export const extendWindowSchema = z.object({
  assessmentId: z.guid(),
  newUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Fecha inválida."),
})
export type ExtendWindowInput = z.infer<typeof extendWindowSchema>
