/**
 * Copy for `/admin/audit` and `/platform/audit` (Phase 7). Kept separate from
 * `es.ts` so parallel feature work never collides in one dictionary (C12).
 */
export const auditMessages = {
  nav: {
    title: "Auditoría",
  },
  admin: {
    pageTitle: "Registro de auditoría",
    pageDescription: "Historial de acciones realizadas en tu organización.",
  },
  platform: {
    pageTitle: "Registro de auditoría",
    pageDescription: "Historial de acciones realizadas en todas las organizaciones.",
  },
  columns: {
    date: "Fecha",
    actor: "Usuario",
    action: "Acción",
    entity: "Entidad",
    organization: "Organización",
  },
  filters: {
    actorPlaceholder: "Buscar por usuario…",
    actionLabel: "Acción",
    entityTypeLabel: "Entidad",
    organizationLabel: "Organización",
    fromLabel: "Desde",
    toLabel: "Hasta",
  },
  metadata: {
    toggle: "Ver detalle",
    empty: "Sin detalle adicional.",
  },
  systemActor: "Sistema",
  unknownOrganization: "—",
  unknownEntityType: "—",
  entityIdLabel: "ID:",
  empty: {
    title: "Todavía no hay eventos de auditoría.",
    description: "Las acciones administrativas van a aparecer acá a medida que ocurran.",
  },
} as const

/**
 * Spanish label for every `action` string ever written to `audit_logs` (L1).
 * The action -> entityType mapping stays in `action-catalog.ts` (not copy);
 * this is copy-only, kept in the shared message dictionary like every other
 * feature (C12).
 */
export const auditActionLabels: Record<string, string> = {
  "organization.created": "Organización creada",
  "organization.updated": "Organización actualizada",
  "organization.status_changed": "Estado de organización cambiado",
  "org_settings.updated": "Configuración de organización actualizada",
  "score_range.upserted": "Rango de puntaje guardado",
  "score_range.deleted": "Rango de puntaje eliminado",

  "member.role_changed": "Rol de miembro cambiado",
  "member.status_changed": "Estado de miembro cambiado",
  "member.profile_updated": "Datos de miembro actualizados",
  "user.registered": "Usuario registrado",

  "registration_link.created": "Link de registro creado",
  "registration_link.revoked": "Link de registro revocado",
  "registration_link.toggled": "Link de registro activado/desactivado",

  "group.created": "Grupo creado",
  "group.updated": "Grupo actualizado",
  "group.deleted": "Grupo eliminado",
  "group.member_added": "Miembros agregados al grupo",
  "group.member_removed": "Miembro quitado del grupo",

  "course.created": "Curso creado",
  "course.updated": "Curso actualizado",
  "course.deleted": "Curso eliminado",
  "course.published": "Curso publicado",
  "course.archived": "Curso archivado",
  "course.professor_assigned": "Profesor asignado al curso",
  "course.professor_unassigned": "Profesor desasignado del curso",

  "module.created": "Módulo creado",
  "module.updated": "Módulo actualizado",
  "module.deleted": "Módulo eliminado",
  "module.reordered": "Módulos reordenados",
  "module_dependency.upserted": "Dependencia de módulo guardada",
  "module_dependency.deleted": "Dependencia de módulo eliminada",

  "lesson.created": "Lección creada",
  "lesson.updated": "Lección actualizada",
  "lesson.deleted": "Lección eliminada",
  "lesson.reordered": "Lecciones reordenadas",

  "content_block.created": "Bloque de contenido creado",
  "content_block.updated": "Bloque de contenido actualizado",
  "content_block.deleted": "Bloque de contenido eliminado",
  "content_block.reordered": "Bloques de contenido reordenados",
  "content.completed": "Contenido completado",
  "content.uncompleted": "Contenido marcado como no completado",

  "offering.created": "Edición de curso creada",
  "offering.updated": "Edición de curso actualizada",
  "offering.status_changed": "Estado de edición cambiado",
  "offering.schedule_updated": "Cronograma de edición actualizado",
  "offering.enrollments_synced": "Inscripciones sincronizadas",
  "offering.professor_assigned": "Profesor asignado a la edición",
  "offering.professor_unassigned": "Profesor quitado de la edición",

  "enrollment.self_enrolled": "Auto-inscripción a curso",

  "question_bank.created": "Banco de preguntas creado",
  "question_bank.updated": "Banco de preguntas actualizado",
  "question.created": "Pregunta creada",
  "question.updated": "Pregunta actualizada",
  "question.options_replaced": "Opciones de pregunta reemplazadas",
  "question.activated": "Pregunta activada",
  "question.reactivated": "Pregunta reactivada",
  "question.deactivated": "Pregunta desactivada",

  "assessment.created": "Evaluación creada",
  "assessment.updated": "Evaluación actualizada",
  "assessment.deleted": "Evaluación eliminada",
  "assessment.published": "Evaluación publicada",
  "assessment.questions_set": "Preguntas de evaluación configuradas",
  "assessment.questions_saved": "Preguntas de evaluación guardadas",
  "assessment.window_extended": "Ventana de evaluación extendida",
  "assessment.started": "Intento de evaluación iniciado",
  "assessment.submitted": "Intento de evaluación entregado",
  "assessment.auto_submitted": "Intento de evaluación auto-entregado",
  "assessment.graded": "Intento de evaluación corregido",
  "assessment.feedback_saved": "Comentario de evaluación guardado",
  "assessment.task_submitted": "Tarea entregada",
  "assessment.task_resubmitted": "Entrega de tarea reemplazada",
  "assessment.task_graded": "Tarea corregida",
  "video_checkpoints.saved": "Preguntas del video guardadas",
  "attempt.finalize_failed": "Falló el cierre automático del intento",
}

/** Spanish label for an `entity_type` value, used on rows and filters (L1). */
export const auditEntityTypeLabels: Record<string, string> = {
  organization: "Organización",
  organization_settings: "Configuración",
  score_scale_range: "Rango de puntaje",
  organization_membership: "Membresía",
  organization_registration_link: "Link de registro",
  group: "Grupo",
  course: "Curso",
  module: "Módulo",
  module_dependency: "Dependencia de módulo",
  lesson: "Lección",
  content_block: "Bloque de contenido",
  lesson_content_block: "Bloque de contenido",
  course_offering: "Edición de curso",
  course_enrollment: "Inscripción",
  question_bank: "Banco de preguntas",
  question: "Pregunta",
  assessment: "Evaluación",
  assessment_attempt: "Intento de evaluación",
}
