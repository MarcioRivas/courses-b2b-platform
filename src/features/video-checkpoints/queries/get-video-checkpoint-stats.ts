import "server-only"

import { createClient } from "@/lib/supabase/server"
import type { VideoCheckpointStats } from "../types"

/** Aggregate checkpoint results for one video block (editors only — `video_checkpoint_stats` refuses anyone else). */
export async function getVideoCheckpointStats(blockId: string): Promise<VideoCheckpointStats | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("video_checkpoint_stats", { p_block: blockId })

  if (error || !data || typeof data !== "object") {
    return null
  }

  const stats = data as unknown as VideoCheckpointStats
  return {
    enrolledCount: Number(stats.enrolledCount),
    checkpoints: stats.checkpoints.map((checkpoint) => ({
      ...checkpoint,
      avgAttemptsToPass: checkpoint.avgAttemptsToPass === null ? null : Number(checkpoint.avgAttemptsToPass),
    })),
  }
}
