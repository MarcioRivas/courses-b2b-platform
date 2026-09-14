import { z } from "zod"

export const selfEnrollSchema = z.object({
  courseId: z.guid(),
})

export type SelfEnrollInput = z.infer<typeof selfEnrollSchema>
