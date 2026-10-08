"use server"

import { z } from "zod"
import { requireOrgRole } from "@/lib/auth/require-role"
import type { ActionResult } from "@/lib/errors"
import { messages } from "@/lib/messages/es"
import { getBlockCheckpointsForEditor } from "../queries/get-block-checkpoints-for-editor"
import { getVideoCheckpointStats } from "../queries/get-video-checkpoint-stats"
import type { EditorCheckpoint, VideoCheckpointStats } from "../types"

const blockIdSchema = z.object({ blockId: z.guid() })

/** The editor's checkpoints (with answer key) for one block; RLS limits it to the course's editors. */
export async function loadBlockCheckpoints(input: { blockId: string }): Promise<ActionResult<EditorCheckpoint[]>> {
  const parsed = blockIdSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, code: "VALIDATION", message: messages.errors.VALIDATION }
  }
  await requireOrgRole(["ADMIN", "PROFESSOR"])
  return { ok: true, data: await getBlockCheckpointsForEditor(parsed.data.blockId) }
}

/** Aggregate statistics for one block; `video_checkpoint_stats` refuses non-editors. */
export async function loadVideoCheckpointStats(input: { blockId: string }): Promise<ActionResult<VideoCheckpointStats>> {
  const parsed = blockIdSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, code: "VALIDATION", message: messages.errors.VALIDATION }
  }
  await requireOrgRole(["ADMIN", "PROFESSOR"])
  const stats = await getVideoCheckpointStats(parsed.data.blockId)
  return stats ? { ok: true, data: stats } : { ok: false, code: "FORBIDDEN", message: messages.errors.FORBIDDEN }
}
