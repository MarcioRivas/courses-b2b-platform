import { learnMessages } from "@/lib/messages/learn"

interface ProgressBarProps {
  percent: number
  completedBlocks: number
  totalBlocks: number
  /** Hides the "X de Y bloques" line on dense surfaces like the dashboard card. */
  compact?: boolean
  /** Accessible name; defaults to the course progress label. */
  label?: string
}

/**
 * Plain markup rather than the Base UI `Progress` primitive: a server-rendered
 * readout (its fill eases when a refresh changes the value), and keeping
 * it a Server Component avoids shipping the primitive to every dashboard card.
 */
export function ProgressBar({ percent, completedBlocks, totalBlocks, compact, label }: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)))

  return (
    <div className="flex flex-col gap-1">
      <div
        role="progressbar"
        aria-label={label ?? learnMessages.progress.barLabel}
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={learnMessages.progress.percentLabel(clamped)}
        className="h-2 w-full overflow-hidden rounded-full bg-muted"
      >
        {/* scaleX, not width: no layout per frame; animates when the page refreshes after a completion. */}
        <div
          className="h-full w-full origin-left rounded-full bg-linear-to-r from-primary to-brand transition-transform duration-400 ease-out-quint"
          style={{ transform: `scaleX(${clamped / 100})` }}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {learnMessages.progress.percentLabel(clamped)}
        {!compact && ` · ${learnMessages.progress.blocksLabel(completedBlocks, totalBlocks)}`}
      </p>
    </div>
  )
}
