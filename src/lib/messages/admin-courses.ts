/** Copy for org-admin/professor course screens (`src/features/courses/**`). */
export const courseMessages = {
  nav: {
    courses: "Cursos",
  },
  list: {
    title: "Cursos",
    searchPlaceholder: "Buscar por título…",
    createAction: "Nuevo curso",
    titleHeader: "Título",
    statusHeader: "Estado",
    accessHeader: "Acceso",
    statusFilterAll: "Todos los estados",
    emptyTitle: "Todavía no hay cursos.",
    viewAction: "Ver",
  },
  status: {
    DRAFT: "Borrador",
    PUBLISHED: "Publicado",
    ARCHIVED: "Archivado",
  },
  access: {
    FREE: "Gratuito",
    PRIVATE: "Privado",
  },
  form: {
    createTitle: "Nuevo curso",
    editTitle: "Editar curso",
    titleLabel: "Título",
    descriptionLabel: "Descripción",
    accessTypeLabel: "Tipo de acceso",
    accessTypeHelpLocked: "El tipo de acceso no se puede cambiar una vez publicado el curso.",
    saved: "Curso guardado.",
  },
  detail: {
    detailTab: "Detalle",
    offeringsTab: "Ediciones",
    contentTab: "Contenido",
    publishAction: "Publicar",
    archiveAction: "Archivar",
    goToContentBuilder: "Ir al constructor de contenido",
  },
  publish: {
    title: "Publicar curso",
    description: "El curso quedará visible para estudiantes y profesores según su tipo de acceso.",
    confirmLabel: "Publicar",
    success: "Curso publicado.",
    incompleteTitle: "El curso todavía no se puede publicar",
    missingModule: "Al menos un módulo",
    missingLesson: "Al menos una lección",
    missingBlock: "Al menos un bloque de contenido",
  },
  archive: {
    title: "Archivar curso",
    description: "El curso deja de aceptar nuevas inscripciones. El contenido y el historial se mantienen.",
    confirmLabel: "Archivar",
    success: "Curso archivado.",
  },
  delete: {
    title: "Eliminar curso",
    description: "Esta acción no se puede deshacer.",
    success: "Curso eliminado.",
  },
  teach: {
    title: "Mis cursos",
    emptyTitle: "Todavía no tenés cursos asignados.",
  },
  errors: {
    duplicateName: "Ya existe un curso con ese título.",
    deleteNotDraft: "Solo se pueden eliminar cursos en borrador. Archivá el curso en su lugar.",
    deleteHasEnrollments: "No se puede eliminar un curso con inscripciones.",
    accessTypeLocked: "No se puede cambiar el tipo de acceso de un curso publicado o archivado.",
  },
} as const
