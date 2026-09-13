import { EmptyState } from "@/components/shared/empty-state"
import { learnMessages } from "@/lib/messages/learn"
import type { StudentEnrollment } from "../types"
import { EnrollmentCard } from "./enrollment-card"

interface EnrollmentSectionProps {
  title: string
  active: StudentEnrollment[]
  finished: StudentEnrollment[]
  emptyMessage: string
  timeZone: string
}

/** One dashboard section ("asignados" / "gratuitos") split into en curso / finalizados (§37). */
export function EnrollmentSection({
  title,
  active,
  finished,
  emptyMessage,
  timeZone,
}: EnrollmentSectionProps) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-base font-semibold tracking-tight">{title}</h2>

      {active.length === 0 && finished.length === 0 ? (
        <EmptyState title={emptyMessage} />
      ) : (
        <>
          <Shelf title={learnMessages.dashboard.activeTitle} items={active} timeZone={timeZone} />
          <Shelf title={learnMessages.dashboard.finishedTitle} items={finished} timeZone={timeZone} />
        </>
      )}
    </section>
  )
}

function Shelf({
  title,
  items,
  timeZone,
}: {
  title: string
  items: StudentEnrollment[]
  timeZone: string
}) {
  if (items.length === 0) {
    return null
  }

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</h3>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((enrollment) => (
          <li key={enrollment.id} className="contents">
            <EnrollmentCard enrollment={enrollment} timeZone={timeZone} />
          </li>
        ))}
      </ul>
    </div>
  )
}
