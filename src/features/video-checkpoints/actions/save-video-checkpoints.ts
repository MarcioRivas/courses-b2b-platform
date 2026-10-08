"use server"

import { revalidateOfferingContent } from "@/lib/courses/revalidate-offering-content"
import { createClient } from "@/lib/supabase/server"
import { requireOrgRole } from "@/lib/auth/require-role"
import type { ActionResult } from "@/lib/errors"
import { messages } from "@/lib/messages/es"
import { saveVideoCheckpointsSchema, type SaveVideoCheckpointsInput } from "../schemas/video-checkpoint-schemas"
import { checkpointRpcErrorResult } from "../lib/video-checkpoint-errors"

/**
 * Saves a video block's whole checkpoint set. `save_video_checkpoints`
 * re-checks edit rights and every limit, and upserts by id so kept
 * checkpoints/questions/options keep student progress and statistics.
 */
export async function saveVideoCheckpoints(input: SaveVideoCheckpointsInput): Promise<ActionResult<void>> {
  const parsed = saveVideoCheckpointsSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, code: "VALIDATION", message: parsed.error.issues[0]?.message ?? messages.errors.VALIDATION }
  }

  await requireOrgRole(["ADMIN", "PROFESSOR"])
  const supabase = await createClient()

  const { error } = await supabase.rpc("save_video_checkpoints", {
    p_block: parsed.data.blockId,
    p_checkpoints: parsed.data.checkpoints,
  })
  if (error) {
    return checkpointRpcErrorResult(error)
  }

  const { data: offeringId } = await supabase.rpc("offering_id_of_block", { p_block: parsed.data.blockId })
  if (offeringId) {
    await revalidateOfferingContent(offeringId)
  }

  return { ok: true, data: undefined }
}
