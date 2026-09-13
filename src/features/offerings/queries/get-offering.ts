import { createClient } from "@/lib/supabase/server"
import type { OfferingDetail } from "../types"

export async function getOffering(offeringId: string): Promise<OfferingDetail | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("course_offerings")
    .select("id, course_id, organization_id, kind, group_id, name, starts_at, ends_at, status, courses(title), groups(name)")
    .eq("id", offeringId)
    .maybeSingle()

  if (error || !data) {
    return null
  }

  const { count } = await supabase
    .from("course_enrollments")
    .select("id", { count: "exact", head: true })
    .eq("offering_id", offeringId)
    .eq("status", "ACTIVE")

  return {
    id: data.id,
    courseId: data.course_id,
    courseTitle: data.courses?.title ?? "",
    organizationId: data.organization_id,
    kind: data.kind,
    groupId: data.group_id,
    groupName: data.groups?.name ?? null,
    name: data.name,
    startsAt: data.starts_at,
    endsAt: data.ends_at,
    status: data.status,
    enrolledCount: count ?? 0,
  }
}
