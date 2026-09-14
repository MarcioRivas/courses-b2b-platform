import { z } from "zod"
import { ANSWER_TEXT_MAX } from "../lib/dirty-map"

/**
 * Shared by the Server Actions and the keepalive Route Handlers — both entry
 * points must validate identically, or the unload path becomes a way to send
 * the RPC something the normal path would have rejected.
 */
export const answerSchema = z.object({
  attempt_question_id: z.guid(),
  selected_option_id: z.guid().nullable().optional(),
  // Must mirror save_answers_batch's own cap (ANSWER_TEXT_MAX, review N3).
  text_answer: z.string().max(ANSWER_TEXT_MAX).nullable().optional(),
  client_seq: z.number().int().nonnegative(),
})

export const saveAnswersSchema = z.object({
  sessionId: z.guid(),
  answers: z.array(answerSchema).max(100),
})

export const heartbeatSchema = z.object({
  sessionId: z.guid(),
  force: z.boolean().optional(),
})

export const releaseSchema = z.object({
  sessionId: z.guid(),
})

export type AnswerInput = z.infer<typeof answerSchema>
export type SaveAnswersInput = z.infer<typeof saveAnswersSchema>
