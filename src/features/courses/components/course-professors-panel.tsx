"use client"

import { useMemo, useState, useTransition } from "react"
import { toast } from "sonner"
import { messages } from "@/lib/messages/es"
import { courseMessages } from "@/lib/messages/admin-courses"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/shared/empty-state"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { assignProfessor } from "../actions/assign-professor"
import { unassignProfessor } from "../actions/unassign-professor"
import type { AssignableProfessor, CourseProfessor } from "../types"

interface CourseProfessorsPanelProps {
  courseId: string
  professors: CourseProfessor[]
  assignableProfessors: AssignableProfessor[]
}

/** Combines the assigned-professors list with a multi-select picker (mirrors GroupDetailPage + GroupMemberPicker). */
export function CourseProfessorsPanel({ courseId, professors, assignableProfessors }: CourseProfessorsPanelProps) {
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [isPending, startTransition] = useTransition()

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return assignableProfessors
    return assignableProfessors.filter((p) => `${p.firstName} ${p.lastName}`.toLowerCase().includes(needle))
  }, [query, assignableProfessors])

  function toggle(userId: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(userId)) {
        next.delete(userId)
      } else {
        next.add(userId)
      }
      return next
    })
  }

  function handleAssign() {
    if (selected.size === 0) return
    startTransition(async () => {
      const ids = Array.from(selected)
      const results = await Promise.all(ids.map((userId) => assignProfessor({ courseId, userId })))
      const failed = results.filter((r) => !r.ok)
      const added = results.length - failed.length

      if (failed.length > 0) {
        toast.error(failed[0]!.ok ? messages.errors.INTERNAL : failed[0]!.message)
      }
      if (added > 0) {
        toast.success(courseMessages.professors.success(added))
      }
      setSelected(new Set())
      setQuery("")
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">{courseMessages.professors.assignedTitle}</h2>
        {professors.length === 0 ? (
          <EmptyState title={courseMessages.professors.emptyAssigned} />
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
                      {messages.common.delete}
                    </Button>
                  }
                  title={courseMessages.professors.unassignTitle}
                  description={courseMessages.professors.unassignDescription}
                  confirmLabel={messages.common.delete}
                  destructive
                  action={unassignProfessor}
                  input={{ courseId, userId: professor.userId }}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">{courseMessages.professors.addTitle}</h2>
        {assignableProfessors.length === 0 ? (
          <p className="text-sm text-muted-foreground">{courseMessages.professors.empty}</p>
        ) : (
          <div className="flex flex-col gap-3">
            <Input
              placeholder={courseMessages.professors.searchPlaceholder}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto rounded-lg border p-2">
              {filtered.map((professor) => (
                <li key={professor.userId}>
                  <label className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
                    <Checkbox
                      checked={selected.has(professor.userId)}
                      onCheckedChange={() => toggle(professor.userId)}
                    />
                    {professor.firstName} {professor.lastName}
                  </label>
                </li>
              ))}
              {filtered.length === 0 && (
                <li className="p-2 text-sm text-muted-foreground">{courseMessages.professors.noResults}</li>
              )}
            </ul>
            <Button onClick={handleAssign} disabled={isPending || selected.size === 0} className="self-start">
              {isPending ? messages.common.loading : courseMessages.professors.submit(selected.size)}
            </Button>
          </div>
        )}
      </section>
    </div>
  )
}
