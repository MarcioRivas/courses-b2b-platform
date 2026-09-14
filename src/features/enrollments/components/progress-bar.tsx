import { learnMessages } from "@/lib/messages/learn"

interface ProgressBarProps {
  percent: number
  completedBlocks: number
  totalBlocks: number
  /** Hides the "X de Y bloques" line on dense surfaces like the dashboard card. */
  compact?: boolean
}

/**
 * Plain markup rather than the Base UI `Progress` primitive: this is a static,
 * server-rendered readout with no indeterminate or animated state, and keeping
 * it a Server Component avoids shipping the primitive to every dashboard card.
 */
export function ProgressBar({ percent, completedBlocks, totalBlocks, compact }: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)))

  return (
    <div className="flex flex-col gap-1">
      <div
        role="progressbar"
        aria-label={learnMessages.progress.barLabel}
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={learnMessages.progress.percentLabel(clamped)}
        className="h-2 w-full overflow-hidden rounded-full bg-muted"
      >
        <div className="h-full rounded-full bg-linear-to-r from-primary to-brand transition-all" style={{ width: `${clamped}%` }} />
      </div>
      <p className="text-xs text-muted-foreground">
        {learnMessages.progress.percentLabel(clamped)}
        {!compact && ` · ${learnMessages.progress.blocksLabel(completedBlocks, totalBlocks)}`}
      </p>
    </div>
  )
}
