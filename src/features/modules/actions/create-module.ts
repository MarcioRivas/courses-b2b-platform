"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireOrgRole } from "@/lib/auth/require-role"
import { canEditCourse } from "@/lib/auth/course-access"
import { logAudit } from "@/lib/audit/log"
import { getCourseOrganizationId } from "@/lib/courses/get-course-organization-id"
import { toActionError, type ActionResult } from "@/lib/errors"
import { messages } from "@/lib/messages/es"
import { createModuleSchema, type CreateModuleInput } from "../schemas/module-schemas"

export async function createModule(input: CreateModuleInput): Promise<ActionResult<{ id: string }>> {
  const parsed = createModuleSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, code: "VALIDATION", message: parsed.error.issues[0]?.message ?? messages.errors.VALIDATION }
  }

  await requireOrgRole(["ADMIN", "PROFESSOR"])

  if (!(await canEditCourse(parsed.data.courseId))) {
    return { ok: false, code: "FORBIDDEN", message: messages.errors.FORBIDDEN }
  }

  const supabase = await createClient()

  const { data: last } = await supabase
    .from("modules")
    .select("position")
    .eq("course_id", parsed.data.courseId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle()

  const nextPosition = (last?.position ?? 0) + 1

  const { data, error } = await supabase
    .from("modules")
    .insert({
      course_id: parsed.data.courseId,
      title: parsed.data.title,
      description: parsed.data.description || null,
      position: nextPosition,
    })
    .select("id")
    .single()

  if (error || !data) {
    return { ok: false, ...toActionError(error) }
  }

  await logAudit({
    organizationId: await getCourseOrganizationId(parsed.data.courseId),
    action: "module.created",
    entityType: "module",
    entityId: data.id,
    metadata: { title: parsed.data.title, courseId: parsed.data.courseId },
  })

  revalidatePath(`/admin/courses/${parsed.data.courseId}/content`)
  revalidatePath(`/teach/courses/${parsed.data.courseId}/content`)

  return { ok: true, data: { id: data.id } }
}
