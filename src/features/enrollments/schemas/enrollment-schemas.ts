import { z } from "zod"

export const selfEnrollSchema = z.object({
  courseId: z.string().uuid(),
})

export type SelfEnrollInput = z.infer<typeof selfEnrollSchema>
