import { z } from "zod"

const nameSchema = z.string().trim().min(2, "Ingresá al menos 2 caracteres.").max(120, "Máximo 120 caracteres.")
const descriptionSchema = z.string().trim().max(500, "Máximo 500 caracteres.").optional().or(z.literal(""))

export const createBankSchema = z.object({
  courseId: z.string().uuid().optional(),
  name: nameSchema,
  description: descriptionSchema,
})
export type CreateBankInput = z.infer<typeof createBankSchema>

export const updateBankSchema = z.object({
  bankId: z.string().uuid(),
  name: nameSchema,
  description: descriptionSchema,
})
export type UpdateBankInput = z.infer<typeof updateBankSchema>

const optionSchema = z.object({
  label: z.string().trim().min(1, "Completá el texto de la opción.").max(300, "Máximo 300 caracteres."),
  isCorrect: z.boolean(),
})

/** MC editor invariant (5A step 2): 2–6 options, exactly one correct. */
const mcOptionsSchema = z
  .array(optionSchema)
  .min(2, "Agregá al menos 2 opciones.")
  .max(6, "Máximo 6 opciones.")
  .refine((options) => options.filter((o) => o.isCorrect).length === 1, {
    message: "Marcá exactamente una opción como correcta.",
  })

const promptSchema = z.string().trim().min(2, "Ingresá el enunciado.").max(4000, "Máximo 4000 caracteres.")
const pointsSchema = z.coerce.number().positive("Los puntos deben ser mayores a 0.").max(1000)

export const questionFormSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("MULTIPLE_CHOICE"),
    prompt: promptSchema,
    defaultPoints: pointsSchema,
    options: mcOptionsSchema,
  }),
  z.object({
    type: z.literal("OPEN_ENDED"),
    prompt: promptSchema,
    defaultPoints: pointsSchema,
  }),
])
export type QuestionFormInput = z.infer<typeof questionFormSchema>

export const createQuestionSchema = z.object({
  questionBankId: z.string().uuid(),
  question: questionFormSchema,
})
export type CreateQuestionInput = z.infer<typeof createQuestionSchema>

export const updateQuestionSchema = z.object({
  questionId: z.string().uuid(),
  question: questionFormSchema,
})
export type UpdateQuestionInput = z.infer<typeof updateQuestionSchema>

export const setQuestionActiveSchema = z.object({
  questionId: z.string().uuid(),
  isActive: z.boolean(),
})
export type SetQuestionActiveInput = z.infer<typeof setQuestionActiveSchema>
