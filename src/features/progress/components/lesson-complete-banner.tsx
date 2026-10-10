"use client"

import { useState } from "react"
import { CheckIcon, TrophyIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { learnMessages } from "@/lib/messages/learn"

interface LessonCompleteBannerProps {
  lessonComplete: boolean
  moduleComplete: boolean
  moduleTitle: string
  hasNextLesson: boolean
}

/**
 * The earned moment of the lesson player: shown once the lesson's required
 * blocks are all done. It animates only when the lesson flips to complete
 * during this visit (the page refreshes in place after each completion, so
 * this component keeps its state); a lesson that was already done renders
 * statically. Reduced motion collapses the animation globally (motion.css).
 */
export function LessonCompleteBanner({ lessonComplete, moduleComplete, moduleTitle, hasNextLesson }: LessonCompleteBannerProps) {
  const [completeOnArrival] = useState(lessonComplete)
  const copy = learnMessages.lesson
  const Icon = moduleComplete ? TrophyIcon : CheckIcon

  // The live region is always mounted (empty until done): screen readers
  // announce content added to an existing region far more reliably than a
  // region that is inserted already filled.
  return (
    <div role="status">
      {lessonComplete && (
        <div
          className={cn(
            "mt-6 flex items-center gap-3 rounded-2xl border border-success/30 bg-success-soft p-4 shadow-card",
            !completeOnArrival && "animate-reward-in"
          )}
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-success text-success-foreground">
            <Icon className="size-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="font-heading font-semibold">{moduleComplete ? copy.moduleCompleted : copy.lessonCompleted}</p>
            <p className="text-sm text-muted-foreground">
              {moduleComplete
                ? copy.moduleCompletedHint(moduleTitle)
                : hasNextLesson
                  ? copy.continueHint
                  : copy.backToCourseHint}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
