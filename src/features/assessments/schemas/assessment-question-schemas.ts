import { z } from "zod"

const optionSchema = z.object({
  label: z.string().trim().min(1, "Completá el texto de la opción.").max(300, "Máximo 300 caracteres."),
  isCorrect: z.boolean(),
})

/** MC invariant (mirrored by `save_assessment_questions`): 2–6 options, exactly one correct. */
const mcOptionsSchema = z
  .array(optionSchema)
  .min(2, "Agregá al menos 2 opciones.")
  .max(6, "Máximo 6 opciones.")
  .refine((options) => options.filter((o) => o.isCorrect).length === 1, {
    message: "Marcá exactamente una opción como correcta.",
  })

const promptSchema = z.string().trim().min(2, "Ingresá el enunciado.").max(4000, "Máximo 4000 caracteres.")
const pointsSchema = z.coerce.number().positive("Los puntos deben ser mayores a 0.").max(1000, "Máximo 1000.")
/** An existing question keeps its id so the RPC updates the row instead of recreating it. */
const idSchema = z.guid().optional()

export const assessmentQuestionSchema = z.discriminatedUnion("type", [
  z.object({
    id: idSchema,
    type: z.literal("MULTIPLE_CHOICE"),
    prompt: promptSchema,
    points: pointsSchema,
    options: mcOptionsSchema,
  }),
  z.object({
    id: idSchema,
    type: z.literal("OPEN_ENDED"),
    prompt: promptSchema,
    points: pointsSchema,
  }),
])
export type AssessmentQuestionInput = z.infer<typeof assessmentQuestionSchema>

export const saveAssessmentQuestionsSchema = z
  .object({
    assessmentId: z.guid(),
    questions: z.array(assessmentQuestionSchema).max(200, "Máximo 200 preguntas."),
    /** NULL = every student gets every question. */
    randomCount: z.number().int().positive().nullable(),
  })
  .refine((data) => data.randomCount === null || data.randomCount <= data.questions.length, {
    path: ["randomCount"],
    message: "La cantidad al azar supera el total de preguntas.",
  })
export type SaveAssessmentQuestionsInput = z.infer<typeof saveAssessmentQuestionsSchema>
