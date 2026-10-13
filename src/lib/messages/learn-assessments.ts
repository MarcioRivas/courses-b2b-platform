/**
 * Copy for the student assessment player (`src/features/attempts/**`,
 * `/learn/assessments/**`, `/learn/attempts/**`) and the two EXAM visibility
 * surfaces on the student dashboard (F13). Kept out of `learn.ts` so this
 * phase never collides with the enrollment/progress dictionary (C12).
 */
export const learnAssessmentMessages = {
  kind: {
    QUIZ: "Cuestionario",
    TASK: "Tarea",
    EXAM: "Examen",
  },
  common: {
    backToCourse: "Volver al curso",
    backToAttempts: "Volver a mis cursos",
  },
  preflight: {
    startAction: "Comenzar",
    continueAction: "Continuar",
    openTaskAction: "Ver tarea",
    viewSubmissionAction: "Ver entrega",
    questionCountLabel: (count: number) => (count === 1 ? "1 pregunta" : `${count} preguntas`),
    questionCountUnknown: "Cantidad de preguntas variable",
    durationLabel: (minutes: number) => `${minutes} min`,
    noDuration: "Sin límite de tiempo",
    windowFromPrefix: "Disponible desde el",
    windowUntilPrefix: "hasta el",
    noWindow: "Sin ventana de disponibilidad",
    attemptsLabel: (used: number, max: number | null) =>
      max === null ? `${used} intentos usados (ilimitados)` : `${used} de ${max} intentos usados`,
    rulesTitle: "Antes de empezar",
    rulesQuiz: "Podés responder las veces que quieras hasta aprobar. Tus respuestas se guardan automáticamente.",
    rulesExam:
      "Tenés un único intento y tiempo límite. El cronómetro corre aunque cierres la pestaña — no lo abras hasta estar listo/a.",
    inProgressNotice: "Ya tenés un intento en curso. Podés continuarlo desde donde quedó.",
  },
  player: {
    progressLabel: (answered: number, total: number) => `${answered}/${total} respondidas`,
    questionLabel: (position: number) => `Pregunta ${position}`,
    pointsLabel: (points: number) => (points === 1 ? "1 punto" : `${points} puntos`),
    openAnswerPlaceholder: "Escribí tu respuesta acá…",
    charCount: (count: number, max: number) => `${count}/${max}`,
    submitAction: "Entregar",
    submitting: "Enviando…",
  },
  submitDialog: {
    title: "¿Entregar la evaluación?",
    description: "Una vez que entregues no vas a poder modificar tus respuestas.",
    unansweredWarning: (count: number) =>
      count === 0
        ? "Respondiste todas las preguntas."
        : count === 1
          ? "Todavía queda 1 pregunta sin responder."
          : `Todavía quedan ${count} preguntas sin responder.`,
    confirm: "Sí, entregar",
    retry: "Reintentar entrega",
    cancel: "Seguir respondiendo",
  },
  save: {
    saving: "Guardando…",
    savedAtPrefix: "Guardado",
    error: "No se pudo guardar. Reintentando…",
  },
  timer: {
    label: "Tiempo restante",
    warningFiveMinutes: "Quedan 5 minutos.",
    warningOneMinute: "Queda 1 minuto.",
    expired: "El tiempo se agotó. Enviando tus respuestas…",
    noLimit: "Sin límite de tiempo",
  },
  sessionLocked: {
    title: "Esta evaluación ya está abierta en otra sesión",
    description: "Solo se puede responder desde un lugar a la vez.",
    takeOverAction: "Continuar acá y cerrar la otra sesión",
    retryAction: "Reintentar",
  },
  result: {
    title: "Resultado",
    pendingGrading: "Pendiente de corrección",
    pendingGradingDescription: "Un profesor va a revisar tus respuestas de desarrollo pronto.",
    scoreLabel: "Puntaje",
    percentLabel: "Porcentaje",
    passed: "Aprobado",
    notPassed: "No aprobado",
    feedbackTitle: "Comentario del profesor",
    correctAnswer: "Correcta",
    incorrectAnswer: "Incorrecta",
    yourAnswer: "Tu respuesta",
    noAnswer: "Sin responder",
    attemptNumberLabel: (n: number) => `Intento N.º ${n}`,
    retryAttempt: "Intentar de nuevo",
    attemptsLeft: (n: number) => (n === 1 ? "Te queda 1 intento." : `Te quedan ${n} intentos.`),
    noAttemptsLeft: "No te quedan intentos.",
  },
  courseSection: {
    title: "Exámenes",
    empty: "Este curso todavía no tiene exámenes.",
    stateUpcoming: "Próximamente",
    stateOpen: "Abierto",
    stateClosed: "Cerrado",
    attemptsLabel: (used: number, max: number | null) => (max === null ? `${used} intentos` : `${used}/${max} intentos`),
    startAction: "Comenzar",
    continueAction: "Continuar",
    newAttemptAction: "Nuevo intento",
    reviewAction: "Ver resultado",
  },
  pendingStrip: {
    title: "Pendientes y resultados",
    pendingLabel: "Para rendir",
    resultsLabel: "Resultados recientes",
    goToAssessment: "Ir",
    seeResult: "Ver resultado",
  },
  errors: {
    ASSESSMENT_NOT_AVAILABLE: "Esta evaluación no está disponible.",
    ASSESSMENT_EXPIRED: "La ventana de esta evaluación ya cerró.",
    ATTEMPT_EXPIRED: "Se acabó el tiempo de este intento.",
    ATTEMPT_LIMIT_REACHED: "Ya usaste todos tus intentos para esta evaluación.",
    ALREADY_COMPLETED: "Ya completaste esta evaluación.",
    SESSION_LOCKED: "Esta evaluación ya está abierta en otra sesión.",
    MODULE_LOCKED: "Todavía no desbloqueaste el módulo de esta evaluación.",
    INVALID_BLOCK_TYPE: "Esta evaluación no se puede completar manualmente.",
    INVALID_ANSWER: "Una de tus respuestas no es válida.",
    SAVE_FAILED: "No se pudo guardar. Intentá de nuevo.",
    CONNECTION_LOST: "Se perdió la conexión. Reintentando…",
    UNKNOWN: "Ocurrió un error inesperado. Intentá de nuevo.",
  },
} as const
