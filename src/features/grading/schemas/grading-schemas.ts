import { z } from "zod"

/**
 * The 0..max range is re-validated server-side against the question's actual
 * `points` (dynamic, per question) before the RPC call — Zod only enforces
 * the shape and the non-negative floor here.
 */
export const gradeAnswerSchema = z.object({
  attemptId: z.string().uuid(),
  attemptQuestionId: z.string().uuid(),
  points: z.number().min(0, "El puntaje no puede ser negativo."),
  feedback: z.string().trim().max(4000, "Máximo 4000 caracteres.").optional(),
})
export type GradeAnswerInput = z.infer<typeof gradeAnswerSchema>

export const saveAttemptFeedbackSchema = z.object({
  attemptId: z.string().uuid(),
  feedback: z.string().trim().min(1, "Ingresá un comentario.").max(4000, "Máximo 4000 caracteres."),
})
export type SaveAttemptFeedbackInput = z.infer<typeof saveAttemptFeedbackSchema>
