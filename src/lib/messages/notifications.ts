/** Copy for in-app notifications (header bell). */
const plural = (count: number, one: string, many: string) => (count === 1 ? one : many)

export const notificationsMessages = {
  button: {
    title: "Notificaciones",
    unread: (count: number) => plural(count, "1 sin leer", `${count} sin leer`),
  },
  panel: {
    markAll: "Marcar todo como leído",
    loading: "Cargando notificaciones…",
    empty: "No tenés notificaciones.",
    failed: "No se pudieron cargar las notificaciones.",
    retry: "Reintentar",
    loadMore: "Ver más",
    unreadDot: "Sin leer",
  },
  kind: {
    QUIZ: "el cuestionario",
    TASK: "la tarea",
    EXAM: "el examen",
  } as Record<string, string>,
  types: {
    MODULE_OPENED: {
      title: "Nuevo módulo disponible",
      body: (module: string, course: string) => `"${module}" ya está disponible en ${course}.`,
    },
    MODULE_CLOSING_SOON: {
      title: "Un módulo cierra pronto",
      body: (module: string, when: string) => `"${module}" cierra el ${when} y todavía no lo completaste.`,
    },
    ASSESSMENT_GRADED: {
      title: "Tenés una corrección nueva",
      body: (kind: string, title: string) => `Ya podés ver la corrección de ${kind} "${title}".`,
    },
    ASSESSMENT_DUE_SOON: {
      title: "Entrega próxima",
      body: (title: string, when: string) => `"${title}" vence el ${when} y todavía no lo entregaste.`,
    },
    EXAM_TODAY: {
      title: "Hoy tenés examen",
      body: (title: string, time: string) => `"${title}" empieza hoy a las ${time}.`,
    },
    TASK_READY_TO_GRADE: {
      title: "Tarea lista para corregir",
      body: (title: string, count: number) =>
        `"${title}" cerró con ${plural(count, "1 entrega", `${count} entregas`)} para corregir.`,
    },
    LATE_SUBMISSIONS: {
      title: "Entregas fuera de plazo",
      body: (title: string, count: number) =>
        `${plural(count, "1 entrega fuera de plazo", `${count} entregas fuera de plazo`)} en "${title}".`,
    },
    ATTEMPT_NEEDS_GRADING: {
      title: "Respuestas para corregir",
      body: (title: string, count: number) =>
        `${plural(count, "1 intento", `${count} intentos`)} de "${title}" ${plural(count, "espera", "esperan")} corrección.`,
    },
    fallback: { title: "Notificación", body: "Tenés una novedad." },
  },
}
