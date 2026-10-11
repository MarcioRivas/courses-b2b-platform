import type { MatrixCase } from "./matrix-runner"
import { tenancySpec } from "./rls-matrix-spec-tenancy"
import { coursesSpec } from "./rls-matrix-spec-courses"
import { contentSpec } from "./rls-matrix-spec-content"
import { assessmentsSpec } from "./rls-matrix-spec-assessments"
import { progressSpec } from "./rls-matrix-spec-progress"
import { messagingSpec } from "./rls-matrix-spec-messaging"

/** All public tables × {select, insert, update, delete} × 7 roles, combined. */
export function fullMatrixSpec(): MatrixCase[] {
  return [...tenancySpec(), ...coursesSpec(), ...contentSpec(), ...assessmentsSpec(), ...progressSpec(), ...messagingSpec()]
}

/**
 * Tables confirmed (docs/authorization.md D24 + catalog) to have NO
 * INSERT/UPDATE/DELETE policy for `authenticated` at all — write absence is
 * asserted once via `pg_policies`, not simulated per role in the matrix.
 */
export const NO_WRITE_POLICY_TABLES = [
  "profiles",
  "profile_private",
  "platform_admins",
  "organization_memberships",
  "assessment_attempts",
  "assessment_attempt_questions",
  "assessment_attempt_answer_keys",
  "assessment_grades",
  "assessment_feedback",
  "course_enrollments",
  "content_progress",
  "audit_logs",
  "video_checkpoint_attempts",
  "video_checkpoint_attempt_answers",
  "conversations",
  "messages",
] as const
