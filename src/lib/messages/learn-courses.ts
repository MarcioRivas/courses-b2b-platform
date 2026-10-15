/** Copy for the student "Cursos" screen (`/learn`). */
const plural = (count: number, one: string, many: string) => (count === 1 ? one : many)

export const learnCoursesMessages = {
  title: "Cursos",
  description: "Tus cursos y los que podés sumar de tu organización.",
  firstCourseTitle: "Elegí tu primer curso",
  search: {
    label: "Buscar cursos",
    placeholder: "Buscar cursos…",
  },
  views: {
    label: "Mostrar",
    todos: "Todos",
    "mis-cursos": "Mis cursos",
    disponibles: "Disponibles",
  },
  tags: {
    assigned: "Asignado",
    free: "Gratis",
  },
  card: {
    finished: "Finalizado",
    closedOn: (date: string) => `Cerró el ${date}`,
    closed: "Cerrado",
    modules: (count: number) => plural(count, "1 módulo", `${count} módulos`),
  },
  actions: {
    continue: "Continuar",
    start: "Empezar",
    enroll: "Inscribirme",
    enrolling: "Inscribiendo…",
    startNow: "Empezar ahora",
  },
  toasts: {
    enrolled: (title: string) => `Te inscribiste en ${title}`,
  },
  results: (count: number) => plural(count, "1 curso", `${count} cursos`),
  empty: {
    noAvailable: "No hay cursos disponibles por ahora.",
    noAvailableHint: "Cuando tu organización publique cursos gratuitos, van a aparecer acá.",
    noCourses: "Todavía no tenés cursos.",
    noResults: (q: string, view: string) => `No encontramos "${q}" en ${view}.`,
    searchAll: "Buscar en todos",
    clearFilters: "Limpiar filtros",
  },
} as const
