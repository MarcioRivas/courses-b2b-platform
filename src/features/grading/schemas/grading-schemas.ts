import { z } from "zod"

/**
 * The 0..max range per question is re-validated server-side (grade_attempt_batch)
 * against each question's snapshotted `points` — Zod only enforces the shape and
 * the non-negative floor here.
 */
export const saveAttemptGradesSchema = z.object({
  attemptId: z.guid(),
  grades: z.array(
    z.object({
      attemptQuestionId: z.guid(),
      points: z.number().min(0, "El puntaje no puede ser negativo."),
      feedback: z.string().trim().max(4000, "Máximo 4000 caracteres.").optional(),
    })
  ),
  feedback: z.string().trim().min(1, "Ingresá un comentario.").max(4000, "Máximo 4000 caracteres."),
})
export type SaveAttemptGradesInput = z.infer<typeof saveAttemptGradesSchema>
