"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireOrgRole } from "@/lib/auth/require-role"
import { logAudit } from "@/lib/audit/log"
import { toActionError, type ActionResult } from "@/lib/errors"
import { messages } from "@/lib/messages/es"
import { createCourseSchema, type CreateCourseInput } from "../schemas/course-schemas"

export async function createCourse(input: CreateCourseInput): Promise<ActionResult<{ id: string }>> {
  const parsed = createCourseSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      code: "VALIDATION",
      message: parsed.error.issues[0]?.message ?? messages.errors.VALIDATION,
    }
  }

  const ctx = await requireOrgRole(["ADMIN"])
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("courses")
    .insert({
      organization_id: ctx.organizationId,
      title: parsed.data.title,
      description: parsed.data.description || null,
      access_type: parsed.data.accessType,
      created_by: ctx.user.id,
    })
    .select("id")
    .single()

  if (error || !data) {
    return { ok: false, ...toActionError(error) }
  }

  await logAudit({
    organizationId: ctx.organizationId,
    action: "course.created",
    entityType: "course",
    entityId: data.id,
    metadata: { title: parsed.data.title, accessType: parsed.data.accessType },
  })

  revalidatePath("/admin/courses")

  return { ok: true, data: { id: data.id } }
}
