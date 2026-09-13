/** Registration link screen copy (C12). Never merge into `es.ts` — area-scoped. */
export const adminLinksMessages = {
  title: "Links de registro",
  description: "Generá links para que nuevos miembros se registren en la organización.",
  createTrigger: "Nuevo link",
  form: {
    labelField: "Etiqueta",
    labelPlaceholder: "Ej: Ingreso temporada 2026",
    roleField: "Rol por defecto",
    expiresField: "Vence",
    submit: "Crear link",
    success: "Link creado.",
  },
  columns: {
    label: "Etiqueta",
    role: "Rol",
    state: "Estado",
    uses: "Usos",
    expires: "Vence",
    actions: "Acciones",
  },
  state: {
    ACTIVE: "Activo",
    INACTIVE: "Inactivo",
    EXPIRED: "Expirado",
    REVOKED: "Revocado",
  },
  noExpiry: "Sin vencimiento",
  empty: {
    title: "No hay links de registro",
    description: "Creá un link para que puedan registrarse nuevos miembros.",
  },
  toggle: {
    activateTrigger: "Activar",
    deactivateTrigger: "Desactivar",
    successActivate: "Link activado.",
    successDeactivate: "Link desactivado.",
  },
  revoke: {
    trigger: "Revocar",
    title: "Revocar link",
    description:
      "Esta acción es irreversible: el link va a dejar de funcionar para siempre y no se puede reactivar.",
    confirm: "Revocar",
    success: "Link revocado.",
  },
  copy: {
    trigger: "Copiar",
  },
  errors: {
    adminRoleForbidden: "Solo un super administrador puede crear links con rol Administrador.",
    expiryInPast: "La fecha de vencimiento debe ser futura.",
    orgInactive: "La organización está desactivada. Activala para crear links de registro.",
    notFound: "El link ya no existe.",
  },
} as const
