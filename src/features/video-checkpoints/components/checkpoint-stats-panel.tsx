"use client"

import { useEffect, useState } from "react"
import { EmptyState } from "@/components/shared/empty-state"
import { videoCheckpointMessages } from "@/lib/messages/video-checkpoints"
import { messages } from "@/lib/messages/es"
import { loadVideoCheckpointStats } from "../actions/load-block-checkpoints"
import type { CheckpointStats, VideoCheckpointStats } from "../types"
import { CheckpointStatsCard } from "./checkpoint-stats-card"

/** Below this many students, "hardest checkpoint" would just be noise. */
const MIN_REACHED_FOR_HARDEST = 5

function hardestCheckpointId(checkpoints: CheckpointStats[]): string | null {
  const candidates = checkpoints.filter((c) => c.reached >= MIN_REACHED_FOR_HARDEST && c.firstTryAttempts > 0)
  const rate = (c: CheckpointStats) => c.firstTryPassed / c.firstTryAttempts
  return candidates.sort((a, b) => rate(a) - rate(b))[0]?.id ?? null
}

/** Professor statistics for one video's checkpoints (aggregates only, no per-student list). */
export function CheckpointStatsPanel({ blockId }: { blockId: string }) {
  const copy = videoCheckpointMessages.stats
  const [stats, setStats] = useState<VideoCheckpointStats | null | "error">(null)

  useEffect(() => {
    let cancelled = false
    loadVideoCheckpointStats({ blockId }).then((result) => {
      if (!cancelled) setStats(result.ok ? result.data : "error")
    })
    return () => {
      cancelled = true
    }
  }, [blockId])

  if (stats === null) {
    return <p className="text-sm text-muted-foreground">{messages.common.loading}</p>
  }
  if (stats === "error") {
    return <p className="text-sm text-destructive">{videoCheckpointMessages.errors.UNKNOWN}</p>
  }
  if (stats.checkpoints.length === 0) {
    return <EmptyState title={copy.empty} />
  }

  const hardest = hardestCheckpointId(stats.checkpoints)

  return (
    <section className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">{copy.hint}</p>
      <ul className="flex flex-col gap-3">
        {stats.checkpoints.map((checkpoint) => (
          <CheckpointStatsCard
            key={checkpoint.id}
            checkpoint={checkpoint}
            enrolledCount={stats.enrolledCount}
            hardest={checkpoint.id === hardest}
          />
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">{copy.editedNote}</p>
    </section>
  )
}
