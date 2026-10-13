/**
 * Public landing page copy (rioplatense Spanish, voseo — same register as `es.ts`).
 * `icon` keys are resolved to Lucide components inside each landing component.
 */
export const landingMessages = {
  meta: { title: "Formación para clubes y federaciones" },
  header: {
    login: "Iniciar sesión",
    navLabel: "Secciones",
    nav: { features: "Funcionalidades", experience: "Experiencia", how: "Cómo funciona", roles: "Roles" },
  },
  hero: {
    eyebrow: "Para clubes, federaciones y academias",
    titleStart: "Formá a tu club con cursos que",
    titleHighlight: "se completan",
    subtitle:
      "Cursos, evaluaciones y seguimiento en un solo lugar. Tus profesores enseñan, tus deportistas avanzan a su ritmo y vos ves el progreso de toda la organización.",
    ctaPrimary: "Ingresar a la plataforma",
    ctaSecondary: "Ver funcionalidades",
    mock: {
      title: "Panel de la organización",
      subtitle: "Resumen de esta semana",
      // `value` is animated as a counter; `suffix` stays static next to it.
      stats: [
        { label: "Deportistas activos", value: 248, suffix: "", delta: "+12" },
        { label: "Cursos publicados", value: 16, suffix: "", delta: "+3" },
        { label: "Evaluaciones aprobadas", value: 91, suffix: " %", delta: "+4 %" },
      ],
      highlightDelta: "+4 %",
      progressLabel: "Progreso promedio de los cursos",
      progressValue: "72 %",
    },
  },
  features: {
    eyebrow: "Funcionalidades",
    title: "Todo lo que necesita una organización deportiva para formar",
    lead: "Pensado para clubes, federaciones y academias que quieren enseñar mejor y medir resultados.",
    items: [
      {
        icon: "organizations",
        title: "Un espacio por organización",
        description: "Cada club o federación trabaja con sus propios miembros, grupos y cursos, completamente aislados del resto.",
      },
      {
        icon: "courses",
        title: "Cursos por edición",
        description: "Módulos, lecciones con texto, video y quizzes. Abrí una nueva edición copiando la anterior en un clic.",
      },
      {
        icon: "timer",
        title: "Evaluaciones confiables",
        description: "Exámenes con tiempo controlado por el servidor y autoguardado: sin trampas ni respuestas perdidas.",
      },
      {
        icon: "analytics",
        title: "Estadísticas claras",
        description: "Inscriptos, progreso y correcciones pendientes por curso y por edición, para decidir con datos.",
      },
      {
        icon: "security",
        title: "Auditoría y seguridad",
        description: "Registro de cada acción relevante, permisos por rol y aislamiento de datos en la base.",
      },
      {
        icon: "progress",
        title: "Avance con sentido",
        description: "Los módulos se desbloquean al completar lo requerido, y cada logro se reconoce en el momento.",
      },
    ],
  },
  experience: {
    eyebrow: "Para tus deportistas",
    title: "Una experiencia que dan ganas de completar",
    lead: "Lecciones cortas, videos con preguntas, progreso siempre visible y un reconocimiento cada vez que terminan algo.",
    points: [
      { icon: "video", title: "Videos con preguntas", description: "El video se pausa y pregunta: nadie avanza sin entender." },
      { icon: "progress", title: "Progreso a la vista", description: "Cada bloque completado mueve la barra de la lección y del curso." },
      { icon: "reward", title: "Logros reconocidos", description: "Terminar una lección o un módulo se celebra en el momento." },
    ],
    mock: {
      lesson: "Fundamentos · Lección 1",
      blocks: ["Video: entrada en calor dinámica", "Lectura: principios de la carga", "Quiz: descanso entre series"],
      done: "Completado",
      progressLabel: "Progreso de la lección",
      completedTitle: "Lección completada",
      completedHint: "Seguí con la próxima lección.",
    },
  },
  how: {
    eyebrow: "Cómo funciona",
    title: "En marcha en tres pasos",
    lead: "Sin instalaciones ni configuraciones complejas: invitá a tu equipo y empezá a formar.",
    steps: [
      {
        title: "Creá tu organización",
        description: "Definí tu club o federación, invitá administradores y compartí links de registro con tu comunidad.",
      },
      {
        title: "Publicá cursos y evaluaciones",
        description: "Armá módulos con lecciones, quizzes y exámenes. Asigná profesores a cada edición y abrí las inscripciones.",
      },
      {
        title: "Seguí el progreso",
        description: "Mirá las estadísticas por edición, corregí entregas y acompañá a cada deportista hasta el final.",
      },
    ],
  },
  roles: {
    eyebrow: "Roles",
    title: "Lo que obtiene cada persona",
    lead: "Cada rol ve solo lo que necesita, con permisos claros y una interfaz sin distracciones.",
    items: [
      {
        icon: "admin",
        title: "Administrador",
        description: "Gestioná la organización de punta a punta.",
        bullets: ["Miembros, grupos y links de registro", "Cursos, ediciones e inscripciones", "Estadísticas y registro de auditoría"],
      },
      {
        icon: "teacher",
        title: "Profesor",
        description: "Enseñá y evaluá con herramientas simples.",
        bullets: ["Contenido de tus ediciones", "Cuestionarios, tareas y exámenes", "Corrección de entregas y tareas"],
      },
      {
        icon: "student",
        title: "Deportista",
        description: "Aprendé a tu ritmo desde cualquier dispositivo.",
        bullets: ["Tus cursos y progreso por módulo", "Quizzes y exámenes con autoguardado", "Resultados y devoluciones"],
      },
    ],
  },
  trust: {
    title: "Construida para la confianza",
    items: [
      { icon: "rls", title: "Datos aislados", description: "Cada organización ve solo lo suyo, garantizado en la base de datos." },
      { icon: "otp", title: "Sin contraseñas", description: "Acceso con un código por correo, nada que olvidar." },
      { icon: "audit", title: "Registro de auditoría", description: "Trazabilidad de cada acción relevante." },
      { icon: "a11y", title: "Accesible AA", description: "Diseñada según WCAG 2.1 nivel AA." },
    ],
  },
  finalCta: {
    title: "Llevá la formación de tu club al siguiente nivel",
    description: "Ingresá con tu correo: sin contraseñas y con los datos de tu organización siempre aislados.",
    action: "Ingresar a la plataforma",
  },
  footer: {
    login: "Iniciar sesión",
    navLabel: "Links del pie de página",
    rights: "Todos los derechos reservados.",
  },
} as const
