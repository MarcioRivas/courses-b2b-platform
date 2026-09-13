import { afterAll, describe, expect, it } from "vitest"
import { createMemberFactory } from "../helpers/membership"
import { supabaseAdmin } from "../helpers/supabase-admin"
import {
  cleanupFixtures,
  enrollStudent,
  makeCourseFixture,
  type MakeCourseOptions,
} from "../helpers/course-fixtures"
import type { TestUser } from "../helpers/make-user"

/**
 * `module_unlock_state` (phase-04, D17/D25/D29): every gate, in the order the
 * function evaluates them, plus who is allowed to ask.
 */

const ORG_A = "11111111-1111-1111-1111-111111111111"
const ORG_B = "22222222-2222-2222-2222-222222222222"

const cleanup: string[] = []
const courseIds: string[] = []
const member = createMemberFactory(cleanup)

afterAll(async () => {
  await cleanupFixtures({ users: cleanup, courseIds })

})

type StateRow = { module_id: string; state: string; reason: string; available_from: string | null }

async function unlockStates(user: TestUser, enrollmentId: string): Promise<StateRow[]> {
  const { data, error } = await user.client.rpc("module_unlock_state", { p_enrollment: enrollmentId })
  if (error) throw error
  return (data ?? []) as StateRow[]
}

async function twoModuleCourse(title: string, options: Partial<MakeCourseOptions> = {}) {
  const fixture = await makeCourseFixture({
    organizationId: ORG_A,
    title,
    modules: [
      { title: "Módulo 1", requiredBlocks: 2 },
      { title: "Módulo 2", requiredBlocks: 1 },
    ],
    ...options,
  })
  courseIds.push(fixture.courseId)
  return fixture
}

describe("module_unlock_state: dependencies", () => {
  it("locks a module until its prerequisite is completed, then opens it", async () => {
    const student = await member("unlock-dep", ORG_A, "STUDENT")
    const fixture = await twoModuleCourse("Curso dependencias")
    const [first, second] = fixture.modules

    await supabaseAdmin.from("module_dependencies").insert({
      module_id: second!.id,
      condition: "MODULE_COMPLETED",
      depends_on_module_id: first!.id,
    })

    const enrollmentId = await enrollStudent(fixture, ORG_A, student.id)

    const locked = await unlockStates(student, enrollmentId)
    expect(locked.find((row) => row.module_id === first!.id)?.state).toBe("AVAILABLE")
    const blocked = locked.find((row) => row.module_id === second!.id)
    expect(blocked?.state).toBe("LOCKED_DEPENDENCY")
    expect(blocked?.reason).toContain("Módulo 1")

    for (const blockId of first!.blockIds) {
      const { error } = await student.client.rpc("complete_content_block", {
        p_enrollment: enrollmentId,
        p_block: blockId,
        p_completed: true,
      })
      expect(error).toBeNull()
    }

    const opened = await unlockStates(student, enrollmentId)
    expect(opened.find((row) => row.module_id === first!.id)?.state).toBe("COMPLETED")
    expect(opened.find((row) => row.module_id === second!.id)?.state).toBe("AVAILABLE")
  })

  it("treats a prerequisite with no required blocks as satisfied instead of deadlocking", async () => {
    const student = await member("unlock-empty-dep", ORG_A, "STUDENT")
    const fixture = await makeCourseFixture({
      organizationId: ORG_A,
      title: "Curso prerrequisito vacío",
      modules: [
        { title: "Intro sin contenido", requiredBlocks: 0 },
        { title: "Módulo real", requiredBlocks: 1 },
      ],
    })
    courseIds.push(fixture.courseId)

    await supabaseAdmin.from("module_dependencies").insert({
      module_id: fixture.modules[1]!.id,
      condition: "MODULE_COMPLETED",
      depends_on_module_id: fixture.modules[0]!.id,
    })

    const enrollmentId = await enrollStudent(fixture, ORG_A, student.id)
    const states = await unlockStates(student, enrollmentId)

    expect(states.find((row) => row.module_id === fixture.modules[0]!.id)?.state).toBe("COMPLETED")
    expect(states.find((row) => row.module_id === fixture.modules[1]!.id)?.state).toBe("AVAILABLE")
  })
})

describe("module_unlock_state: schedule windows", () => {
  it("reports UPCOMING before the window and EXPIRED after it", async () => {
    const student = await member("unlock-window", ORG_A, "STUDENT")
    const fixture = await twoModuleCourse("Curso ventanas")
    const enrollmentId = await enrollStudent(fixture, ORG_A, student.id)

    const future = new Date(Date.now() + 86_400_000).toISOString()
    const past = new Date(Date.now() - 86_400_000).toISOString()

    await supabaseAdmin.from("offering_module_schedules").insert([
      { offering_id: fixture.offeringId, module_id: fixture.modules[0]!.id, available_from: future },
      { offering_id: fixture.offeringId, module_id: fixture.modules[1]!.id, available_until: past },
    ])

    const states = await unlockStates(student, enrollmentId)
    const upcoming = states.find((row) => row.module_id === fixture.modules[0]!.id)
    expect(upcoming?.state).toBe("UPCOMING")
    // The date itself comes back raw so the UI can format it in the org's zone.
    expect(new Date(upcoming!.available_from!).getTime()).toBe(new Date(future).getTime())
    expect(states.find((row) => row.module_id === fixture.modules[1]!.id)?.state).toBe("EXPIRED")
  })

  it("treats a module with no schedule row as open for the whole offering", async () => {
    const student = await member("unlock-noschedule", ORG_A, "STUDENT")
    const fixture = await twoModuleCourse("Curso sin calendario")
    const enrollmentId = await enrollStudent(fixture, ORG_A, student.id)

    const states = await unlockStates(student, enrollmentId)
    expect(states.every((row) => row.state === "AVAILABLE")).toBe(true)
  })
})

describe("module_unlock_state: the course itself is closed", () => {
  it("expires every module once the offering's ends_at has passed", async () => {
    const student = await member("unlock-ended", ORG_A, "STUDENT")
    const fixture = await twoModuleCourse("Curso cerrado", {
      offeringEndsAt: new Date(Date.now() - 3_600_000).toISOString(),
    })
    const enrollmentId = await enrollStudent(fixture, ORG_A, student.id)

    const states = await unlockStates(student, enrollmentId)
    expect(states).toHaveLength(2)
    expect(states.every((row) => row.state === "EXPIRED")).toBe(true)
    expect(states[0]!.reason).toContain("cerró")
  })

  it("expires every module of a CANCELLED offering", async () => {
    const student = await member("unlock-cancelled", ORG_A, "STUDENT")
    const fixture = await twoModuleCourse("Curso cancelado", { offeringStatus: "CANCELLED" })
    const enrollmentId = await enrollStudent(fixture, ORG_A, student.id)

    const states = await unlockStates(student, enrollmentId)
    expect(states.every((row) => row.state === "EXPIRED")).toBe(true)
  })

  it("expires every module of an ARCHIVED course", async () => {
    const student = await member("unlock-archived", ORG_A, "STUDENT")
    const fixture = await twoModuleCourse("Curso archivado")
    const enrollmentId = await enrollStudent(fixture, ORG_A, student.id)

    await supabaseAdmin
      .from("courses")
      .update({ status: "ARCHIVED", archived_at: new Date().toISOString() })
      .eq("id", fixture.courseId)

    const states = await unlockStates(student, enrollmentId)
    expect(states.every((row) => row.state === "EXPIRED")).toBe(true)
  })
})

describe("module_unlock_state: authorization", () => {
  it("refuses a student asking about someone else's enrollment", async () => {
    const owner = await member("unlock-owner", ORG_A, "STUDENT")
    const intruder = await member("unlock-intruder", ORG_A, "STUDENT")
    const fixture = await twoModuleCourse("Curso ajeno")
    const enrollmentId = await enrollStudent(fixture, ORG_A, owner.id)

    const { error } = await intruder.client.rpc("module_unlock_state", { p_enrollment: enrollmentId })
    expect(error?.code).toBe("42501")
  })

  it("refuses an admin of another organization", async () => {
    const student = await member("unlock-tenant-owner", ORG_A, "STUDENT")
    const foreignAdmin = await member("unlock-tenant-admin", ORG_B, "ADMIN")
    const fixture = await twoModuleCourse("Curso tenencia")
    const enrollmentId = await enrollStudent(fixture, ORG_A, student.id)

    const { error } = await foreignAdmin.client.rpc("module_unlock_state", {
      p_enrollment: enrollmentId,
    })
    expect(error?.code).toBe("42501")
  })

  it("allows the owning organization's admin to inspect a student's progression", async () => {
    const student = await member("unlock-staff-student", ORG_A, "STUDENT")
    const admin = await member("unlock-staff-admin", ORG_A, "ADMIN")
    const fixture = await twoModuleCourse("Curso staff")
    const enrollmentId = await enrollStudent(fixture, ORG_A, student.id)

    const states = await unlockStates(admin, enrollmentId)
    expect(states).toHaveLength(2)
  })

  it("cuts off a student whose membership was deactivated (D29)", async () => {
    const student = await member("unlock-deactivated", ORG_A, "STUDENT")
    const fixture = await twoModuleCourse("Curso desactivado")
    const enrollmentId = await enrollStudent(fixture, ORG_A, student.id)

    await supabaseAdmin
      .from("organization_memberships")
      .update({ status: "INACTIVE" })
      .eq("organization_id", ORG_A)
      .eq("user_id", student.id)

    const { error } = await student.client.rpc("module_unlock_state", { p_enrollment: enrollmentId })
    expect(error?.code).toBe("42501")
  })
})
