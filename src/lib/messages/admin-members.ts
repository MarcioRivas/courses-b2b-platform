/** Member directory + detail copy (C12). Never merge into `es.ts` — area-scoped. */
export const adminMembersMessages = {
  title: "Miembros",
  description: (organizationName: string | null) =>
    `Directorio de miembros de ${organizationName ?? "la organización"}.`,
  searchPlaceholder: "Buscar por nombre, correo o DNI",
  filters: {
    roleLabel: "Rol",
    statusLabel: "Estado",
  },
  columns: {
    name: "Nombre",
    email: "Correo",
    dni: "DNI",
    role: "Rol",
    status: "Estado",
    actions: "Acciones",
  },
  empty: {
    title: "No hay miembros",
    description: "Todavía no hay miembros que coincidan con estos filtros.",
  },
  roleDialog: {
    trigger: "Cambiar rol",
    title: "Cambiar rol",
    description: (name: string) => `Elegí el nuevo rol para ${name}.`,
    submit: "Guardar",
    success: "Rol actualizado.",
  },
  statusToggle: {
    activateTrigger: "Activar",
    deactivateTrigger: "Desactivar",
    deactivateTitle: "Desactivar miembro",
    deactivateDescription: (name: string) =>
      `Esta acción desactiva el acceso de ${name} y cancela automáticamente sus inscripciones activas. Si lo reactivás más adelante, esas inscripciones NO se restauran automáticamente.`,
    activateTitle: "Activar miembro",
    activateDescription: (name: string) => `${name} va a recuperar acceso a la organización.`,
    confirmDeactivate: "Desactivar",
    confirmActivate: "Activar",
    successDeactivate: "Miembro desactivado.",
    successActivate: "Miembro activado.",
  },
  errors: {
    selfRoleChange: "No podés cambiar tu propio rol.",
    lastAdminRole: "La organización debe mantener al menos un administrador activo.",
    selfStatusChange: "No podés cambiar el estado de tu propia cuenta.",
    lastAdminStatus: "La organización debe mantener al menos un administrador activo.",
  },
  detail: {
    back: "Volver a miembros",
    contactTitle: "Contacto",
    emailLabel: "Correo",
    phoneLabel: "Teléfono",
    dniLabel: "DNI",
    joinedLabel: "Miembro desde",
    groupsTitle: "Grupos",
    noGroups: "No pertenece a ningún grupo.",
    notFound: "No encontramos este miembro.",
  },
} as const
