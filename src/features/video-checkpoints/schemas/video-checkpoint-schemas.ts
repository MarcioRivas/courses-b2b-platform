import { z } from "zod"
import { videoCheckpointMessages } from "@/lib/messages/video-checkpoints"

const copy = videoCheckpointMessages.validation

const optionSchema = z.object({
  id: z.guid().optional(),
  label: z.string().trim().min(1, copy.optionRequired).max(300),
  isCorrect: z.boolean(),
})

const questionSchema = z
  .object({
    id: z.guid().optional(),
    prompt: z.string().trim().min(1, copy.promptRequired).max(1000),
    options: z.array(optionSchema).min(2).max(6),
  })
  .refine((question) => question.options.filter((option) => option.isCorrect).length === 1, {
    message: copy.oneCorrect,
    path: ["options"],
  })

const checkpointSchema = z
  .object({
    id: z.guid().optional(),
    atSeconds: z.number().int().min(1).max(43200),
    minCorrect: z.number().int().min(1),
    questions: z.array(questionSchema).min(1).max(5),
  })
  .refine((checkpoint) => checkpoint.minCorrect <= checkpoint.questions.length, { path: ["minCorrect"] })

/** Mirrors every limit `save_video_checkpoints` enforces, so the editor rejects what the RPC would. */
export const saveVideoCheckpointsSchema = z.object({
  blockId: z.guid(),
  checkpoints: z
    .array(checkpointSchema)
    .max(20, copy.tooManyCheckpoints)
    .superRefine((checkpoints, ctx) => {
      const seen = new Set<number>()
      checkpoints.forEach((checkpoint, index) => {
        if (seen.has(checkpoint.atSeconds)) {
          ctx.addIssue({ code: "custom", path: [index, "atSeconds"], message: copy.timeDuplicate })
        }
        seen.add(checkpoint.atSeconds)
      })
    }),
})
export type SaveVideoCheckpointsInput = z.infer<typeof saveVideoCheckpointsSchema>

export const answerCheckpointSchema = z.object({
  enrollmentId: z.guid(),
  checkpointId: z.guid(),
  answers: z.array(z.object({ questionId: z.guid(), optionId: z.guid() })).max(5),
})
export type AnswerCheckpointInput = z.infer<typeof answerCheckpointSchema>

export const lessonCheckpointsSchema = z.object({ enrollmentId: z.guid(), lessonId: z.guid() })
export type LessonCheckpointsInput = z.infer<typeof lessonCheckpointsSchema>
