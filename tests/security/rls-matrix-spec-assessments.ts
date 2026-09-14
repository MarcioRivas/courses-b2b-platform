import type { MatrixCase } from "./matrix-runner"

/**
 * question_banks/questions/question_options gate ALL commands (including
 * SELECT) through `can_edit_question_bank`, which ANDs `is_org_member(org)`
 * first — a platform admin with no membership row is excluded even though
 * `is_org_admin()` would otherwise say yes (docs/authorization.md's per-table
 * SELECT column is stale here; see security-review.md). `assessments`/
 * `assessment_questions` use `can_edit_course`, which has no membership
 * requirement, so the platform admin IS included there.
 */
export function assessmentsSpec(): MatrixCase[] {
  return [
    { table: "question_banks", op: "select", allow: ["adminA", "profA"], target: (fx) => ({ id: fx.assessmentA.bankId }) },
    {
      table: "question_banks",
      op: "insert",
      allow: ["adminA", "profA"],
      payload: (fx) => ({ organization_id: fx.orgA, course_id: fx.courseA.courseId, name: "Matrix Bank" }),
    },
    {
      table: "question_banks",
      op: "update",
      allow: ["adminA", "profA"],
      seed: (fx) => Promise.resolve({ organization_id: fx.orgA, course_id: fx.courseA.courseId, name: "Seed Bank" }),
      mutateColumn: "name",
      updatePayload: { name: "Renamed Bank" },
    },
    {
      table: "question_banks",
      op: "delete",
      allow: ["adminA", "profA"],
      seed: (fx, i) => Promise.resolve({ organization_id: fx.orgA, course_id: fx.courseA.courseId, name: `Del Bank ${i}` }),
    },

    {
      table: "questions",
      op: "select",
      allow: ["adminA", "profA"],
      target: (fx) => ({ id: fx.assessmentA.questions[0]!.questionId }),
    },
    {
      table: "questions",
      op: "insert",
      allow: ["adminA", "profA"],
      payload: (fx) => ({
        question_bank_id: fx.assessmentA.bankId,
        organization_id: fx.orgA,
        type: "MULTIPLE_CHOICE",
        prompt: "Matrix question",
        default_points: 1,
      }),
    },
    {
      table: "questions",
      op: "update",
      allow: ["adminA", "profA"],
      seed: (fx) =>
        Promise.resolve({
          question_bank_id: fx.assessmentA.bankId,
          organization_id: fx.orgA,
          type: "MULTIPLE_CHOICE",
          prompt: "Seed question",
          default_points: 1,
        }),
      mutateColumn: "prompt",
      updatePayload: { prompt: "Renamed question" },
    },
    {
      table: "questions",
      op: "delete",
      allow: ["adminA", "profA"],
      seed: (fx, i) =>
        Promise.resolve({
          question_bank_id: fx.assessmentA.bankId,
          organization_id: fx.orgA,
          type: "MULTIPLE_CHOICE",
          prompt: `Del question ${i}`,
          default_points: 1,
        }),
    },

    {
      table: "question_options",
      op: "select",
      allow: ["adminA", "profA"],
      target: (fx) => ({ id: fx.assessmentA.questions[0]!.correctOptionId! }),
    },
    {
      table: "question_options",
      op: "insert",
      allow: ["adminA", "profA"],
      payload: (fx) => ({ question_id: fx.assessmentA.questions[0]!.questionId, label: "Matrix option", position: 900 }),
    },
    {
      table: "question_options",
      op: "update",
      allow: ["adminA", "profA"],
      seed: (fx) =>
        Promise.resolve({ question_id: fx.assessmentA.questions[0]!.questionId, label: "Seed option", position: 901 }),
      mutateColumn: "label",
      updatePayload: { label: "Renamed option" },
    },
    {
      table: "question_options",
      op: "delete",
      allow: ["adminA", "profA"],
      seed: (fx, i) =>
        Promise.resolve({ question_id: fx.assessmentA.questions[0]!.questionId, label: `Del option ${i}`, position: 950 + i }),
    },

    {
      table: "assessments",
      op: "select",
      allow: ["superAdmin", "adminA", "profA", "studentA"],
      target: (fx) => ({ id: fx.assessmentA.assessmentId }),
    },
    {
      table: "assessments",
      op: "insert",
      allow: ["superAdmin", "adminA", "profA"],
      payload: (fx) => ({ organization_id: fx.orgA, course_id: fx.courseA.courseId, kind: "QUIZ", title: "Matrix Assessment" }),
    },
    {
      table: "assessments",
      op: "update",
      allow: ["superAdmin", "adminA", "profA"],
      seed: (fx) => Promise.resolve({ organization_id: fx.orgA, course_id: fx.courseA.courseId, kind: "QUIZ", title: "Seed Assessment" }),
      mutateColumn: "title",
      updatePayload: { title: "Renamed Assessment" },
    },
    {
      table: "assessments",
      op: "delete",
      allow: ["superAdmin", "adminA", "profA"],
      seed: (fx, i) =>
        Promise.resolve({ organization_id: fx.orgA, course_id: fx.courseA.courseId, kind: "QUIZ", title: `Del Assessment ${i}` }),
    },

    {
      table: "assessment_questions",
      op: "select",
      keyColumns: ["assessment_id", "question_id"],
      allow: ["superAdmin", "adminA", "profA"],
      target: (fx) => ({ assessment_id: fx.assessmentA.assessmentId, question_id: fx.assessmentA.questions[0]!.questionId }),
    },
    {
      table: "assessment_questions",
      op: "insert",
      keyColumns: ["assessment_id", "question_id"],
      allow: ["superAdmin", "adminA", "profA"],
      payload: (fx) => ({ assessment_id: fx.assessmentA.assessmentId, question_id: fx.spareQuestionA, position: 900, points: 1 }),
    },
    {
      table: "assessment_questions",
      op: "delete",
      keyColumns: ["assessment_id", "question_id"],
      allow: ["superAdmin", "adminA", "profA"],
      seed: (fx) =>
        Promise.resolve({ assessment_id: fx.assessmentA.assessmentId, question_id: fx.spareQuestionA, position: 900, points: 1 }),
    },
  ]
}
