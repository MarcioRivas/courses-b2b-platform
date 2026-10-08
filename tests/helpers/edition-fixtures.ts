import { supabaseAdmin } from "./supabase-admin"
import { makeCourseFixture, type CourseFixture } from "./course-fixtures"

export interface EditionContentIds {
  offeringId: string
  moduleId: string
  lessonId: string
  blockId: string
}

export interface TwoEditionCourse {
  courseId: string
  groupId: string
  a: EditionContentIds & { fixture: CourseFixture }
  b: EditionContentIds
}

async function contentIdsOf(offeringId: string): Promise<EditionContentIds> {
  const { data: module } = await supabaseAdmin
    .from("modules")
    .select("id")
    .eq("offering_id", offeringId)
    .order("position")
    .limit(1)
    .single()
  const { data: lesson } = await supabaseAdmin.from("lessons").select("id").eq("module_id", module!.id).limit(1).single()
  const { data: block } = await supabaseAdmin
    .from("lesson_content_blocks")
    .select("id")
    .eq("lesson_id", lesson!.id)
    .order("position")
    .limit(1)
    .single()
  return { offeringId, moduleId: module!.id, lessonId: lesson!.id, blockId: block!.id }
}

/**
 * One PRIVATE course with two editions that each OWN their content: edition A
 * is built by `makeCourseFixture` (OPEN), edition B is a GROUP edition filled
 * through `copy_edition_content` (the same function B3 will call), so both
 * editions have distinct module / lesson / block rows.
 */
export async function makeTwoEditionCourse(organizationId: string, title: string): Promise<TwoEditionCourse> {
  const fixture = await makeCourseFixture({
    organizationId,
    title,
    modules: [{ title: "Módulo único", requiredBlocks: 1 }],
  })

  const { data: group, error: groupError } = await supabaseAdmin
    .from("groups")
    .insert({ organization_id: organizationId, name: `Grupo ed ${title} ${Date.now()}-${Math.random()}` })
    .select("id")
    .single()
  if (groupError || !group) throw groupError ?? new Error("group not created")

  const { data: offeringB, error } = await supabaseAdmin
    .from("course_offerings")
    .insert({
      course_id: fixture.courseId,
      organization_id: organizationId,
      kind: "GROUP",
      group_id: group.id,
      name: "Edición B",
    })
    .select("id")
    .single()
  if (error || !offeringB) throw error ?? new Error("edition B not created")

  const { error: copyError } = await supabaseAdmin.rpc("copy_edition_content", {
    p_source: fixture.offeringId,
    p_target: offeringB.id,
  })
  if (copyError) throw copyError

  return {
    courseId: fixture.courseId,
    groupId: group.id,
    a: { ...(await contentIdsOf(fixture.offeringId)), fixture },
    b: await contentIdsOf(offeringB.id),
  }
}

export async function deleteGroups(groupIds: string[]): Promise<void> {
  if (groupIds.length > 0) await supabaseAdmin.from("groups").delete().in("id", groupIds)
}
