"use client"

import { useMemo, useState, useTransition } from "react"
import { toast } from "sonner"
import { messages } from "@/lib/messages/es"
import { groupMessages } from "@/lib/messages/admin-groups"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { addGroupMembers } from "../actions/add-group-members"
import type { AssignableStudent } from "../types"

interface GroupMemberPickerProps {
  groupId: string
  students: AssignableStudent[]
}

/** Multi-select over a capped, server-fetched list of assignable students (client-side search — YAGNI for MVP org sizes). */
export function GroupMemberPicker({ groupId, students }: GroupMemberPickerProps) {
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [isPending, startTransition] = useTransition()

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return students
    return students.filter((s) => `${s.firstName} ${s.lastName}`.toLowerCase().includes(needle))
  }, [query, students])

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

  function handleAdd() {
    if (selected.size === 0) return
    startTransition(async () => {
      const result = await addGroupMembers({ groupId, userIds: Array.from(selected) })
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      toast.success(groupMessages.addMembers.success(result.data.added))
      setSelected(new Set())
      setQuery("")
    })
  }

  if (students.length === 0) {
    return <p className="text-sm text-muted-foreground">{groupMessages.addMembers.empty}</p>
  }

  return (
    <div className="flex flex-col gap-3">
      <Input
        placeholder={groupMessages.addMembers.searchPlaceholder}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto rounded-lg border p-2">
        {filtered.map((student) => (
          <li key={student.userId}>
            <label className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
              <Checkbox
                checked={selected.has(student.userId)}
                onCheckedChange={() => toggle(student.userId)}
              />
              {student.firstName} {student.lastName}
            </label>
          </li>
        ))}
        {filtered.length === 0 && (
          <li className="p-2 text-sm text-muted-foreground">{groupMessages.addMembers.noResults}</li>
        )}
      </ul>
      <Button onClick={handleAdd} disabled={isPending || selected.size === 0} className="self-start">
        {isPending ? messages.common.loading : groupMessages.addMembers.submit(selected.size)}
      </Button>
    </div>
  )
}
