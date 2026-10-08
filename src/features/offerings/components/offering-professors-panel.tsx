"use client"

import { useEffect, useState, useTransition } from "react"
import { toast } from "sonner"
import { messages } from "@/lib/messages/es"
import { offeringMessages } from "@/lib/messages/admin-offerings"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/shared/empty-state"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { assignOfferingProfessor } from "../actions/assign-offering-professor"
import { unassignOfferingProfessor } from "../actions/unassign-offering-professor"
import { searchAssignableProfessors } from "../actions/search-assignable-professors"
import type { AssignableProfessor, OfferingProfessor } from "../types"

const DEBOUNCE_MS = 300
const MIN_QUERY_LENGTH = 2

interface OfferingProfessorsPanelProps {
  offeringId: string
  professors: OfferingProfessor[]
}

/** Assigned professors with "Quitar", plus a debounced search (max 3 results) with "Asignar". */
export function OfferingProfessorsPanel({ offeringId, professors }: OfferingProfessorsPanelProps) {
  const labels = offeringMessages.professors
  const [query, setQuery] = useState("")
  // Results are tagged with the query that produced them, so stale ones never render.
  const [outcome, setOutcome] = useState<{ q: string; results: AssignableProfessor[]; failed: boolean } | null>(null)
  const [isPending, startTransition] = useTransition()
  // Bumped after an assignment so the search re-runs and drops the new professor.
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    const q = query.trim()
    if (q.length < MIN_QUERY_LENGTH) return
    let cancelled = false
    const timer = setTimeout(async () => {
      const result = await searchAssignableProfessors({ offeringId, q })
      if (cancelled) return
      setOutcome({ q, results: result.ok ? result.data : [], failed: !result.ok })
    }, DEBOUNCE_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query, offeringId, refreshKey])

  const active = query.trim().length >= MIN_QUERY_LENGTH
  const current = active && outcome?.q === query.trim() ? outcome : null
  const visibleResults = current?.results ?? []

  function handleAssign(userId: string) {
    startTransition(async () => {
      const result = await assignOfferingProfessor({ offeringId, userId })
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      toast.success(labels.assigned)
      setQuery("")
      setOutcome(null)
      setRefreshKey((key) => key + 1)
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">{labels.assignedTitle}</h2>
        {professors.length === 0 ? (
          <EmptyState title={labels.emptyAssigned} />
        ) : (
          <ul className="flex flex-col gap-2">
            {professors.map((professor) => (
              <li key={professor.userId} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                <span>
                  {professor.firstName} {professor.lastName}
                </span>
                <ConfirmDialog
                  trigger={
                    <Button variant="ghost" size="sm">
                      {labels.removeAction}
                    </Button>
                  }
                  title={labels.unassignTitle}
                  description={labels.unassignDescription}
                  confirmLabel={labels.removeAction}
                  successMessage={labels.unassigned}
                  destructive
                  action={unassignOfferingProfessor}
                  input={{ offeringId, userId: professor.userId }}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">{labels.addTitle}</h2>
        <Input
          aria-label={labels.searchLabel}
          placeholder={labels.searchPlaceholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {visibleResults.length > 0 && (
          <ul className="flex flex-col gap-1 rounded-lg border p-2">
            {visibleResults.map((professor) => (
              <li key={professor.userId} className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm">
                <span className="min-w-0 truncate">
                  {professor.fullName}
                  <span className="ml-2 text-muted-foreground">{professor.email}</span>
                </span>
                <Button size="sm" variant="outline" disabled={isPending} onClick={() => handleAssign(professor.userId)}>
                  {isPending ? messages.common.loading : labels.assignAction}
                </Button>
              </li>
            ))}
          </ul>
        )}
        {current?.failed && <p className="text-sm text-destructive">{labels.searchError}</p>}
        {current && !current.failed && visibleResults.length === 0 && <p className="text-sm text-muted-foreground">{labels.noResults}</p>}
      </section>
    </div>
  )
}
