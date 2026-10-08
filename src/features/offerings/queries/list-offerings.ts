import { createClient } from "@/lib/supabase/server"
import type { OfferingListItem } from "../types"

/** Offerings of a single course, small lists (no pagination needed for MVP org sizes). */
export async function listOfferings(courseId: string): Promise<OfferingListItem[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("course_offerings")
    .select("id, name, kind, status, starts_at, ends_at, groups(name), course_enrollments(count), offering_professors(count)")
    .eq("course_enrollments.status", "ACTIVE")
    .eq("course_id", courseId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: true })

  if (error) {
    return []
  }

  return (data ?? []).map((offering) => ({
    id: offering.id,
    name: offering.name,
    kind: offering.kind,
    status: offering.status,
    groupName: offering.groups?.name ?? null,
    startsAt: offering.starts_at,
    endsAt: offering.ends_at,
    studentCount: offering.course_enrollments[0]?.count ?? 0,
    professorCount: offering.offering_professors[0]?.count ?? 0,
  }))
}
