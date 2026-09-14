import { randomUUID } from "node:crypto"
import type { MatrixCase } from "./matrix-runner"

/**
 * groups, group_members, courses, course_professors, course_offerings,
 * offering_module_schedules.
 *
 * `groups`/`group_members`/`score_scale_ranges`/`organization_settings`
 * SELECT is `is_org_member()`-only (no platform-admin bypass). Postgres
 * layers a table's SELECT policy on top of INSERT-RETURNING/UPDATE/DELETE
 * visibility (documented Postgres RLS behavior), so the platform admin
 * (`superAdmin`, who has no membership row anywhere) is excluded from write
 * round trips here even though `is_org_admin()` — the write policy itself —
 * says yes. See security-review.md.
 */
export function coursesSpec(): MatrixCase[] {
  return [
    { table: "groups", op: "select", allow: ["adminA", "profA", "studentA"], target: (fx) => ({ id: fx.groupA }) },
    {
      table: "groups",
      op: "insert",
      allow: ["adminA"],
      payload: (fx) => ({ organization_id: fx.orgA, name: `Matrix Group ${randomUUID()}` }),
    },
    {
      table: "groups",
      op: "update",
      allow: ["adminA"],
      seed: (fx) => Promise.resolve({ organization_id: fx.orgA, name: `Seed Group ${randomUUID()}` }),
      mutateColumn: "name",
      updatePayload: { name: `Renamed Group ${randomUUID()}` },
    },
    {
      table: "groups",
      op: "delete",
      allow: ["adminA"],
      seed: (fx, i) => Promise.resolve({ organization_id: fx.orgA, name: `Del Group ${i}-${randomUUID()}` }),
    },

    {
      table: "group_members",
      op: "select",
      allow: ["adminA", "profA", "studentA"],
      target: (fx) => ({ id: fx.groupMemberA }),
    },
    {
      table: "group_members",
      op: "insert",
      allow: ["adminA"],
      payload: (fx) => ({ group_id: fx.spareGroupA, user_id: fx.users.studentA.id }),
    },
    {
      table: "group_members",
      op: "delete",
      allow: ["adminA"],
      seed: (fx) => Promise.resolve({ group_id: fx.spareGroupA, user_id: fx.users.studentA.id }),
    },

    {
      table: "courses",
      op: "select",
      allow: ["superAdmin", "adminA", "profA", "studentA"],
      target: (fx) => ({ id: fx.courseA.courseId }),
    },
    {
      table: "courses",
      op: "insert",
      allow: ["superAdmin", "adminA"],
      payload: (fx) => ({ organization_id: fx.orgA, title: "Matrix Course", status: "DRAFT" }),
    },
    {
      table: "courses",
      op: "update",
      allow: ["superAdmin", "adminA"],
      seed: (fx) => Promise.resolve({ organization_id: fx.orgA, title: "Seed Course", status: "DRAFT" }),
      mutateColumn: "title",
      updatePayload: { title: "Renamed Course" },
    },
    {
      table: "courses",
      op: "delete",
      allow: ["superAdmin", "adminA"],
      seed: (fx, i) => Promise.resolve({ organization_id: fx.orgA, title: `Del Course ${i}`, status: "DRAFT" }),
    },

    {
      // course_professors_select is `user_id = auth.uid() OR can_edit_course(course_id)`
      // — no enrolled-student clause (unlike docs/authorization.md's summary
      // row), so a student does not see this table at all. See security-review.md.
      table: "course_professors",
      op: "select",
      keyColumns: ["course_id", "user_id"],
      allow: ["superAdmin", "adminA", "profA"],
      target: (fx) => ({ course_id: fx.courseA.courseId, user_id: fx.users.profA.id }),
    },
    {
      table: "course_professors",
      op: "insert",
      keyColumns: ["course_id", "user_id"],
      allow: ["superAdmin", "adminA"],
      payload: (fx) => ({ course_id: fx.spareCourseA, user_id: fx.users.profA.id }),
    },
    {
      table: "course_professors",
      op: "delete",
      keyColumns: ["course_id", "user_id"],
      allow: ["superAdmin", "adminA"],
      seed: (fx) => Promise.resolve({ course_id: fx.spareCourseA, user_id: fx.users.profA.id }),
    },

    {
      // is_org_admin bypass applies (no is_org_member layering issue here).
      table: "course_offerings",
      op: "select",
      allow: ["superAdmin", "adminA", "profA", "studentA"],
      target: (fx) => ({ id: fx.courseA.offeringId }),
    },
    {
      // kind=GROUP (not OPEN): fx.courseA already has the one OPEN offering
      // a course may have (course_offerings_one_open_per_course_idx).
      table: "course_offerings",
      op: "insert",
      allow: ["superAdmin", "adminA"],
      payload: (fx) => ({ organization_id: fx.orgA, course_id: fx.courseA.courseId, kind: "GROUP", group_id: fx.spareGroupA, name: "Matrix Offering" }),
    },
    {
      table: "course_offerings",
      op: "update",
      allow: ["superAdmin", "adminA"],
      seed: (fx) =>
        Promise.resolve({ organization_id: fx.orgA, course_id: fx.courseA.courseId, kind: "GROUP", group_id: fx.spareGroupA, name: "Seed Offering" }),
      mutateColumn: "name",
      updatePayload: { name: "Renamed Offering" },
    },
    {
      table: "course_offerings",
      op: "delete",
      allow: ["superAdmin", "adminA"],
      seed: (fx, i) =>
        Promise.resolve({
          organization_id: fx.orgA,
          course_id: fx.courseA.courseId,
          kind: "GROUP",
          group_id: fx.spareGroupA,
          name: `Del Offering ${i}`,
        }),
    },

    {
      // is_org_admin bypass applies (no is_org_member layering issue here).
      table: "offering_module_schedules",
      op: "select",
      allow: ["superAdmin", "adminA", "profA", "studentA"],
      target: (fx) => ({ id: fx.scheduleA }),
    },
    {
      table: "offering_module_schedules",
      op: "insert",
      allow: ["superAdmin", "adminA"],
      payload: (fx) => ({ offering_id: fx.courseA.offeringId, module_id: fx.courseA.modules[1]!.id }),
    },
    {
      table: "offering_module_schedules",
      op: "delete",
      allow: ["superAdmin", "adminA"],
      seed: (fx) => Promise.resolve({ offering_id: fx.courseA.offeringId, module_id: fx.courseA.modules[1]!.id }),
    },
  ]
}
