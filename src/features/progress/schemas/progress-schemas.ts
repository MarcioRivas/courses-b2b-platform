import { z } from "zod"

export const toggleBlockCompletionSchema = z.object({
  enrollmentId: z.string().uuid(),
  blockId: z.string().uuid(),
  completed: z.boolean(),
})

export type ToggleBlockCompletionInput = z.infer<typeof toggleBlockCompletionSchema>
