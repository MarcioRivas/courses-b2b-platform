import { z } from "zod"

export const toggleBlockCompletionSchema = z.object({
  enrollmentId: z.guid(),
  blockId: z.guid(),
  completed: z.boolean(),
})

export type ToggleBlockCompletionInput = z.infer<typeof toggleBlockCompletionSchema>
