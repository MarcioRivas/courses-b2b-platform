"use server"

import { createClient } from "@/lib/supabase/server"
import { requireOrgRole } from "@/lib/auth/require-role"
import type { ActionResult } from "@/lib/errors"
import { messages } from "@/lib/messages/es"
import { lessonCheckpointsSchema, type LessonCheckpointsInput } from "../schemas/video-checkpoint-schemas"
import { fetchLessonCheckpoints } from "../queries/fetch-lesson-checkpoints"
import type { LessonCheckpoints } from "../types"

/** Re-reads the lesson's checkpoints: used by "Reintentar" to get freshly shuffled options and passed flags. */
export async function refreshLessonCheckpoints(input: LessonCheckpointsInput): Promise<ActionResult<LessonCheckpoints>> {
  const parsed = lessonCheckpointsSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, code: "VALIDATION", message: messages.errors.VALIDATION }
  }

  await requireOrgRole(["STUDENT"])
  const checkpoints = await fetchLessonCheckpoints(await createClient(), parsed.data.enrollmentId, parsed.data.lessonId)

  if (!checkpoints) {
    return { ok: false, code: "INTERNAL", message: messages.errors.INTERNAL }
  }

  return { ok: true, data: checkpoints }
}
