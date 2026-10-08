import { z } from "zod"
import { MAX_TASK_FILE_BYTES } from "@/lib/storage/task-submission-file-path"
import { taskSubmissionMessages } from "@/lib/messages/task-submissions"

const fileNameSchema = z.string().trim().min(1).max(255)

/** What the browser announces before uploading; the bucket re-enforces size and type. */
export const prepareTaskUploadSchema = z.object({
  assessmentId: z.guid(),
  enrollmentId: z.guid(),
  files: z
    .array(
      z.object({
        name: fileNameSchema,
        size: z.number().int().positive().max(MAX_TASK_FILE_BYTES),
        type: z.string().max(200),
      })
    )
    .min(1, taskSubmissionMessages.validation.noFiles)
    .max(10),
})
export type PrepareTaskUploadInput = z.infer<typeof prepareTaskUploadSchema>

export const submitTaskSchema = z.object({
  assessmentId: z.guid(),
  enrollmentId: z.guid(),
  files: z
    .array(z.object({ path: z.string().min(1).max(1024), filename: fileNameSchema }))
    .min(1, taskSubmissionMessages.validation.noFiles)
    .max(10),
})
export type SubmitTaskInput = z.infer<typeof submitTaskSchema>

export const discardTaskUploadsSchema = z.object({
  assessmentId: z.guid(),
  enrollmentId: z.guid(),
  paths: z.array(z.string().min(1).max(1024)).min(1).max(10),
})
export type DiscardTaskUploadsInput = z.infer<typeof discardTaskUploadsSchema>

/** `score` is string-typed for the same react-hook-form resolver reason as `updateAssessmentSchema`. */
export const gradeTaskSchema = z.object({
  attemptId: z.guid(),
  /** The submission the grader looked at; a replaced (late) submission is refused as stale. */
  submittedAt: z.string().nullable(),
  score: z
    .string()
    .regex(/^\d{1,3}$/, taskSubmissionMessages.validation.scoreRange)
    .refine((value) => Number(value) <= 100, taskSubmissionMessages.validation.scoreRange),
  feedback: z.string().trim().max(5000, "Máximo 5000 caracteres.").optional().or(z.literal("")),
})
export type GradeTaskInput = z.infer<typeof gradeTaskSchema>

export const taskFileUrlSchema = z.object({ fileId: z.guid() })
export type TaskFileUrlInput = z.infer<typeof taskFileUrlSchema>
