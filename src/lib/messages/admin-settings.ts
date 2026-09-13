/** Copy for org settings and score-scale screens (`src/features/organizations/**`). */
export const settingsMessages = {
  page: {
    title: "Configuración",
    scoreScaleLink: "Escala de puntajes",
  },
  org: {
    timezoneLabel: "Zona horaria",
    passingScoreLabel: "Puntaje mínimo de aprobación por defecto",
  },
  scoreScale: {
    title: "Escala de puntajes",
    description: "Definí los rangos usados para etiquetar los resultados de evaluaciones.",
    addAction: "Agregar rango",
    editAction: "Editar",
    labelField: "Etiqueta",
    minField: "Mínimo",
    maxField: "Máximo",
    isPassingField: "Aprueba",
    deleteTitle: "Eliminar rango",
    deleteDescription: "Esta acción no se puede deshacer.",
    overlapError: "Los rangos se superponen. Ajustá el mínimo o el máximo.",
  },
  errors: {
    notFound: "No se encontró la configuración de la organización.",
  },
} as const
