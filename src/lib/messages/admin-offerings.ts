/** Copy for org-admin offering screens (`src/features/offerings/**`). */
export const offeringMessages = {
  list: {
    title: "Ediciones",
    createAction: "Nueva edición",
    nameHeader: "Nombre",
    kindHeader: "Tipo",
    statusHeader: "Estado",
    groupHeader: "Grupo",
    datesHeader: "Fechas",
    emptyTitle: "Este curso todavía no tiene ediciones.",
    viewAction: "Ver",
  },
  kind: {
    GROUP: "Grupo",
    OPEN: "Abierta",
  },
  status: {
    ACTIVE: "Activa",
    CANCELLED: "Cancelada",
  },
  form: {
    createTitle: "Nueva edición",
    editTitle: "Editar edición",
    nameLabel: "Nombre",
    groupLabel: "Grupo",
    groupPlaceholder: "Seleccioná un grupo…",
    kindLabelOpen: "Tipo: Abierta (se gestiona automáticamente al publicar el curso)",
    startsAtLabel: "Fecha de inicio",
    endsAtLabel: "Fecha de fin",
    saved: "Edición guardada.",
  },
  statusForm: {
    label: "Estado",
    saved: "Estado actualizado.",
  },
  schedule: {
    title: "Calendario de módulos",
    description: "Definí cuándo se habilita cada módulo para esta edición. Dejalo vacío para que esté siempre disponible.",
    moduleHeader: "Módulo",
    fromLabel: "Disponible desde",
    untilLabel: "Disponible hasta",
    saveRow: "Guardar",
    saved: "Calendario actualizado.",
    emptyModules: "Este curso todavía no tiene módulos.",
  },
  enrollment: {
    title: "Inscripciones",
    countLabel: (n: number) => `${n} ${n === 1 ? "estudiante inscripto" : "estudiantes inscriptos"}`,
    syncAction: "Sincronizar inscripciones",
    syncSuccess: (n: number) => (n === 0 ? "No hubo cambios." : `${n} ${n === 1 ? "inscripción actualizada" : "inscripciones actualizadas"}.`),
  },
  errors: {
    groupRequired: "Seleccioná un grupo para esta edición.",
    groupNotAllowed: "Las ediciones de cursos gratuitos no llevan grupo.",
    dateRangeInvalid: "La fecha de inicio debe ser anterior a la fecha de fin.",
    openManaged: "La edición abierta de un curso gratuito se crea automáticamente al publicarlo.",
  },
} as const
