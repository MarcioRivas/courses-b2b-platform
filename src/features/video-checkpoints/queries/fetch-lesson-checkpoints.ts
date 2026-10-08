import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/types/database.types"
import type { LessonCheckpoints } from "../types"

/**
 * `video_checkpoints_for_lesson` for any client: options arrive shuffled and
 * without the answer key. Shared by the initial server render and the
 * "Reintentar" refetch (a new call means a new option order).
 */
export async function fetchLessonCheckpoints(
  supabase: SupabaseClient<Database>,
  enrollmentId: string,
  lessonId: string
): Promise<LessonCheckpoints | null> {
  const { data, error } = await supabase.rpc("video_checkpoints_for_lesson", {
    p_enrollment: enrollmentId,
    p_lesson: lessonId,
  })

  if (error || data === null || typeof data !== "object" || Array.isArray(data)) {
    return null
  }

  return data as unknown as LessonCheckpoints
}
