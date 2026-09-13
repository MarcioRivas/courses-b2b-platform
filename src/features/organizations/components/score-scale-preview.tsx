import { Badge } from "@/components/ui/badge"
import type { ScoreRange } from "../types"

interface ScoreScalePreviewProps {
  ranges: ScoreRange[]
}

/** Neutral preview strip — no per-range colour (D34). */
export function ScoreScalePreview({ ranges }: ScoreScalePreviewProps) {
  if (ranges.length === 0) {
    return null
  }

  return (
    <div className="flex flex-wrap gap-2">
      {ranges.map((range) => (
        <Badge key={range.id} variant="outline" className="gap-1.5">
          <span>{range.label}</span>
          <span className="text-muted-foreground">
            {range.minScore}–{range.maxScore}
          </span>
        </Badge>
      ))}
    </div>
  )
}
