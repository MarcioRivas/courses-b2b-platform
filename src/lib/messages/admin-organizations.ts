/**
 * Copy for the platform organization screens and the admin dashboard stat
 * cards (`src/features/organizations/**`). Kept separate from `es.ts` so
 * parallel feature work never collides in one dictionary (C12).
 */
export const orgMessages = {
  list: {
    title: "Organizaciones",
    searchPlaceholder: "Buscar por nombre…",
    createAction: "Nueva organización",
    nameHeader: "Nombre",
    slugHeader: "Slug",
    statusHeader: "Estado",
    membersHeader: "Miembros",
    viewAction: "Ver",
    emptyTitle: "Todavía no hay organizaciones.",
  },
  status: {
    ACTIVE: "Activa",
    INACTIVE: "Inactiva",
  },
  create: {
    title: "Nueva organización",
    description: "Creá la organización y compartile el link de registro a su administrador.",
    nameLabel: "Nombre",
    slugLabel: "Slug",
    slugHint: "Se genera a partir del nombre. Podés editarlo antes de crear la organización.",
    submit: "Crear organización",
    successTitle: "Organización creada",
    successDescription:
      "Enviásela al administrador de la organización. Este link se muestra una sola vez.",
    linkLabel: "Link de registro del administrador",
    copyHint: "Copiá el link antes de salir de esta pantalla.",
    goToOrg: "Ir a la organización",
  },
  detail: {
    tabsLabel: "Secciones de la organización",
    tabs: {
      detail: "Detalle",
      members: "Miembros",
      links: "Links",
    },
    renameTitle: "Nombre de la organización",
    renameSubmit: "Guardar nombre",
    statusSection: "Estado de la organización",
    activateTitle: "Activar organización",
    activateDescription: "Los miembros vuelven a tener acceso a la plataforma.",
    activateConfirm: "Activar",
    activateSuccess: "Organización activada.",
    deactivateTitle: "Desactivar organización",
    deactivateDescription:
      "Ningún miembro va a poder acceder a la plataforma hasta que se reactive la organización.",
    deactivateConfirm: "Desactivar",
    deactivateSuccess: "Organización desactivada.",
  },
  dashboard: {
    activeStudents: "Estudiantes activos",
    professors: "Profesores",
    groups: "Grupos",
    activeLinks: "Links activos",
  },
} as const
