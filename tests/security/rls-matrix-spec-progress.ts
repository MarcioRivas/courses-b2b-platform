import type { MatrixCase } from "./matrix-runner"

/**
 * D24 no-direct-write tables: assessment_attempts, assessment_attempt_questions,
 * assessment_attempt_answer_keys, assessment_grades, assessment_feedback,
 * course_enrollments, content_progress, audit_logs. None has an INSERT/UPDATE/
 * DELETE policy for `authenticated` (verified once via catalog query in
 * rls-matrix.test.ts) — only SELECT is exercised per role here.
 * `assessment_attempt_answer_keys` has NO policy at all (C8): allow=[] always.
 */
export function progressSpec(): MatrixCase[] {
  return [
    {
      table: "assessment_attempts",
      op: "select",
      allow: ["superAdmin", "adminA", "profA"],
      target: (fx) => ({ id: fx.attemptA }),
    },
    {
      table: "assessment_attempt_questions",
      op: "select",
      allow: ["superAdmin", "adminA", "profA", "studentA"],
      target: (fx) => ({ id: fx.attemptQuestionOpenA }),
    },
    {
      table: "assessment_attempt_answer_keys",
      op: "select",
      keyColumns: ["attempt_question_id"],
      allow: [],
      target: (fx) => ({ attempt_question_id: fx.attemptQuestionMcA }),
    },
    {
      table: "assessment_grades",
      op: "select",
      allow: ["superAdmin", "adminA", "profA"],
      target: (fx) => ({ id: fx.gradeA }),
    },
    {
      table: "assessment_feedback",
      op: "select",
      allow: ["superAdmin", "adminA", "profA"],
      target: (fx) => ({ id: fx.feedbackA }),
    },
    {
      table: "course_enrollments",
      op: "select",
      allow: ["superAdmin", "adminA", "profA", "studentA"],
      target: (fx) => ({ id: fx.enrollmentA }),
    },
    {
      table: "content_progress",
      op: "select",
      allow: ["superAdmin", "adminA", "profA", "studentA"],
      target: (fx) => ({ id: fx.progressA }),
    },
    {
      table: "audit_logs",
      op: "select",
      allow: ["superAdmin", "adminA"],
      target: (fx) => ({ id: fx.auditLogA }),
    },
  ]
}
