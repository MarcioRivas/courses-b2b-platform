/** Copy for org-admin group screens (`src/features/groups/**`). */
export const groupMessages = {
  list: {
    title: "Grupos",
    nameHeader: "Nombre",
    searchPlaceholder: "Buscar por nombre…",
    createAction: "Nuevo grupo",
    membersHeader: "Miembros",
    memberCount: (n: number) => `${n} ${n === 1 ? "miembro" : "miembros"}`,
    viewAction: "Ver",
    emptyTitle: "Todavía no hay grupos.",
  },
  form: {
    createTitle: "Nuevo grupo",
    editTitle: "Editar grupo",
    nameLabel: "Nombre",
    descriptionLabel: "Descripción",
    saved: "Grupo guardado.",
  },
  delete: {
    title: "Eliminar grupo",
    description: "Esta acción no se puede deshacer.",
    success: "Grupo eliminado.",
  },
  detail: {
    membersTitle: "Miembros del grupo",
    addMembersTitle: "Agregar estudiantes",
    emptyMembers: "Este grupo todavía no tiene miembros.",
  },
  removeMember: {
    title: "Quitar del grupo",
    description: "El estudiante deja de formar parte de este grupo.",
  },
  addMembers: {
    searchPlaceholder: "Buscar estudiante…",
    submit: (n: number) => (n === 0 ? "Agregar" : `Agregar (${n})`),
    success: (n: number) => (n === 0 ? "No había estudiantes nuevos para agregar." : `${n} ${n === 1 ? "estudiante agregado" : "estudiantes agregados"}.`),
    empty: "No hay estudiantes activos disponibles para agregar.",
    noResults: "No se encontraron estudiantes con ese nombre.",
  },
  errors: {
    deleteConflict: "No se puede eliminar el grupo porque tiene ediciones de curso asociadas.",
    invalidMember: "Solo podés agregar estudiantes activos de tu organización.",
    memberNotInGroup: "Ese estudiante ya no forma parte del grupo.",
    duplicateName: "Ya existe un grupo con ese nombre.",
  },
} as const
