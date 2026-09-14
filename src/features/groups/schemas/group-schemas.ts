import { z } from "zod"

const groupNameSchema = z
  .string()
  .trim()
  .min(2, "Ingresá al menos 2 caracteres.")
  .max(80, "Máximo 80 caracteres.")

const groupDescriptionSchema = z
  .string()
  .trim()
  .max(280, "Máximo 280 caracteres.")
  .optional()
  .or(z.literal(""))

export const createGroupSchema = z.object({
  name: groupNameSchema,
  description: groupDescriptionSchema,
})
export type CreateGroupInput = z.infer<typeof createGroupSchema>

export const updateGroupSchema = z.object({
  groupId: z.guid(),
  name: groupNameSchema,
  description: groupDescriptionSchema,
})
export type UpdateGroupInput = z.infer<typeof updateGroupSchema>

export const deleteGroupSchema = z.object({ groupId: z.guid() })
export type DeleteGroupInput = z.infer<typeof deleteGroupSchema>

export const addGroupMembersSchema = z.object({
  groupId: z.guid(),
  userIds: z.array(z.guid()).min(1, "Seleccioná al menos un estudiante."),
})
export type AddGroupMembersInput = z.infer<typeof addGroupMembersSchema>

export const removeGroupMemberSchema = z.object({
  groupId: z.guid(),
  userId: z.guid(),
})
export type RemoveGroupMemberInput = z.infer<typeof removeGroupMemberSchema>
