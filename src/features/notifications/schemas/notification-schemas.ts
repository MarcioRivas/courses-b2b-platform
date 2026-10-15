import { z } from "zod"

export const markNotificationReadSchema = z.object({
  notificationId: z.guid(),
})

export type MarkNotificationReadInput = z.infer<typeof markNotificationReadSchema>
