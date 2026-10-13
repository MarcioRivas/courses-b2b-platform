import type { MatrixCase } from "./matrix-runner"

/**
 * questions/question_options belong to exactly one assessment and gate ALL
 * commands (including SELECT) through `can_edit_offering` of that assessment's
 * edition: org admins (platform admin included) and the edition's professors.
 * Students have no policy on either table; they only see their attempt
 * snapshot. Banks and `assessment_questions` were removed (inline assessments).
 */
export function assessmentsSpec(): MatrixCase[] {
  return [
    {
      table: "questions",
      op: "select",
      allow: ["superAdmin", "adminA", "profA"],
      target: (fx) => ({ id: fx.assessmentA.questions[0]!.questionId }),
    },
    {
      table: "questions",
      op: "insert",
      allow: ["superAdmin", "adminA", "profA"],
      payload: (fx) => ({
        assessment_id: fx.assessmentA.assessmentId,
        type: "MULTIPLE_CHOICE",
        prompt: "Matrix question",
        points: 1,
        position: 900,
      }),
    },
    {
      table: "questions",
      op: "update",
      allow: ["superAdmin", "adminA", "profA"],
      seed: (fx) =>
        Promise.resolve({
          assessment_id: fx.assessmentA.assessmentId,
          type: "MULTIPLE_CHOICE",
          prompt: "Seed question",
          points: 1,
          position: 901,
        }),
      mutateColumn: "prompt",
      updatePayload: { prompt: "Renamed question" },
    },
    {
      table: "questions",
      op: "delete",
      allow: ["superAdmin", "adminA", "profA"],
      seed: (fx, i) =>
        Promise.resolve({
          assessment_id: fx.assessmentA.assessmentId,
          type: "MULTIPLE_CHOICE",
          prompt: `Del question ${i}`,
          points: 1,
          position: 950 + i,
        }),
    },

    {
      table: "question_options",
      op: "select",
      allow: ["superAdmin", "adminA", "profA"],
      target: (fx) => ({ id: fx.assessmentA.questions[0]!.correctOptionId! }),
    },
    {
      table: "question_options",
      op: "insert",
      allow: ["superAdmin", "adminA", "profA"],
      payload: (fx) => ({ question_id: fx.assessmentA.questions[0]!.questionId, label: "Matrix option", position: 900 }),
    },
    {
      table: "question_options",
      op: "update",
      allow: ["superAdmin", "adminA", "profA"],
      seed: (fx) =>
        Promise.resolve({ question_id: fx.assessmentA.questions[0]!.questionId, label: "Seed option", position: 901 }),
      mutateColumn: "label",
      updatePayload: { label: "Renamed option" },
    },
    {
      table: "question_options",
      op: "delete",
      allow: ["superAdmin", "adminA", "profA"],
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
      payload: (fx) => ({ organization_id: fx.orgA, offering_id: fx.courseA.offeringId, kind: "QUIZ", title: "Matrix Assessment" }),
    },
    {
      table: "assessments",
      op: "update",
      allow: ["superAdmin", "adminA", "profA"],
      seed: (fx) => Promise.resolve({ organization_id: fx.orgA, offering_id: fx.courseA.offeringId, kind: "QUIZ", title: "Seed Assessment" }),
      mutateColumn: "title",
      updatePayload: { title: "Renamed Assessment" },
    },
    {
      table: "assessments",
      op: "delete",
      allow: ["superAdmin", "adminA", "profA"],
      seed: (fx, i) =>
        Promise.resolve({ organization_id: fx.orgA, offering_id: fx.courseA.offeringId, kind: "QUIZ", title: `Del Assessment ${i}` }),
    },
  ]
}
