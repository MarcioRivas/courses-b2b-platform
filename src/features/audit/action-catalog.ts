import { auditActionLabels, auditEntityTypeLabels, auditMessages } from "@/lib/messages/audit"

/**
 * Every `action` string ever written to `audit_logs`, mapped to its canonical
 * `entity_type` (docs/authorization.md, D28). Spanish copy lives in
 * `src/lib/messages/audit.ts` (L1) — this file only keeps the action ->
 * entityType shape, which isn't copy and doesn't belong in a message
 * dictionary.
 *
 * Enumerated by grepping every `logAudit(`/`log_audit(`/`log_audit_system(`
 * call site (TS Server Actions and SQL RPCs) as of Phase 7. Kept as a flat
 * object (not derived at runtime) so a renamed action string is a one-line
 * diff here, not a silent "acción desconocida" in the UI.
 */
export interface AuditActionMeta {
  label: string
  entityType: string
}

export const ACTION_ENTITY_TYPES: Record<string, string> = {
  "organization.created": "organization",
  "organization.updated": "organization",
  "organization.status_changed": "organization",
  "org_settings.updated": "organization_settings",
  "score_range.upserted": "score_scale_range",
  "score_range.deleted": "score_scale_range",

  "member.role_changed": "organization_membership",
  "member.status_changed": "organization_membership",
  "member.profile_updated": "organization_membership",
  "user.registered": "organization_membership",

  "registration_link.created": "organization_registration_link",
  "registration_link.revoked": "organization_registration_link",
  "registration_link.toggled": "organization_registration_link",

  "group.created": "group",
  "group.updated": "group",
  "group.deleted": "group",
  "group.member_added": "group",
  "group.member_removed": "group",

  "course.created": "course",
  "course.updated": "course",
  "course.deleted": "course",
  "course.published": "course",
  "course.archived": "course",
  "course.professor_assigned": "course",
  "course.professor_unassigned": "course",

  "module.created": "module",
  "module.updated": "module",
  "module.deleted": "module",
  "module.reordered": "course",
  "module_dependency.upserted": "module_dependency",
  "module_dependency.deleted": "module_dependency",

  "lesson.created": "lesson",
  "lesson.updated": "lesson",
  "lesson.deleted": "lesson",
  "lesson.reordered": "module",

  "content_block.created": "content_block",
  "content_block.updated": "content_block",
  "content_block.deleted": "content_block",
  "content_block.reordered": "lesson",
  "content.completed": "lesson_content_block",
  "content.uncompleted": "lesson_content_block",

  "offering.created": "course_offering",
  "offering.updated": "course_offering",
  "offering.status_changed": "course_offering",
  "offering.schedule_updated": "course_offering",
  "offering.enrollments_synced": "course_offering",
  "offering.professor_assigned": "course_offering",
  "offering.professor_unassigned": "course_offering",

  "enrollment.self_enrolled": "course_enrollment",

  "question_bank.created": "question_bank",
  "question_bank.updated": "question_bank",
  "question.created": "question",
  "question.updated": "question",
  "question.options_replaced": "question",
  "question.activated": "question",
  "question.reactivated": "question",
  "question.deactivated": "question",

  "assessment.created": "assessment",
  "assessment.updated": "assessment",
  "assessment.deleted": "assessment",
  "assessment.published": "assessment",
  "assessment.questions_set": "assessment",
  "assessment.window_extended": "assessment",
  "assessment.started": "assessment_attempt",
  "assessment.submitted": "assessment_attempt",
  "assessment.auto_submitted": "assessment_attempt",
  "assessment.graded": "assessment_attempt",
  "assessment.feedback_saved": "assessment_attempt",
  "attempt.finalize_failed": "assessment_attempt",
}

/** Falls back to the raw action string so an uncatalogued action never renders blank. */
export function actionMeta(action: string): AuditActionMeta {
  return {
    label: auditActionLabels[action] ?? action,
    entityType: ACTION_ENTITY_TYPES[action] ?? auditMessages.unknownEntityType,
  }
}

export function entityTypeLabel(entityType: string): string {
  return auditEntityTypeLabels[entityType] ?? entityType
}
