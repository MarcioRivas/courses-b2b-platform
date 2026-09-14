/**
 * Public landing page copy (rioplatense Spanish, voseo — same register as `es.ts`).
 * `icon` keys are resolved to Lucide components inside each landing component.
 */
export const landingMessages = {
  meta: { title: "Plataforma LMS" },
  header: {
    login: "Iniciar sesión",
    navLabel: "Secciones",
    nav: { features: "Funcionalidades", how: "Cómo funciona", roles: "Roles" },
  },
  hero: {
    eyebrow: "Plataforma LMS multi-organización",
    titleStart: "Formá a tu comunidad deportiva con una",
    titleHighlight: "plataforma moderna",
    subtitle:
      "Cursos, evaluaciones con tiempo en servidor y analíticas en un solo lugar. Cada organización con sus datos aislados y sus propios administradores, profesores y alumnos.",
    ctaPrimary: "Iniciar sesión",
    ctaSecondary: "Ver funcionalidades",
    mock: {
      title: "Panel de la organización",
      subtitle: "Resumen de esta semana",
      stats: [
        { label: "Alumnos activos", value: "248", delta: "+12 %" },
        { label: "Cursos publicados", value: "16", delta: "+3" },
        { label: "Evaluaciones aprobadas", value: "91 %", delta: "+4 %" },
      ],
      highlightDelta: "+4 %",
      progressLabel: "Progreso promedio de los cursos",
      progressValue: "72 %",
    },
  },
  features: {
    eyebrow: "Funcionalidades",
    title: "Todo lo que necesita una organización deportiva para formar",
    lead: "Herramientas pensadas para clubes, federaciones y academias que quieren enseñar mejor y medir resultados.",
    items: [
      {
        icon: "organizations",
        title: "Organizaciones multi-tenant",
        description: "Cada club o federación trabaja en su propio espacio, con sus miembros y sus cursos completamente aislados.",
      },
      {
        icon: "courses",
        title: "Cursos y contenido",
        description: "Módulos, lecciones y bloques de texto, video o quiz. Publicá en minutos y actualizá sin perder el progreso.",
      },
      {
        icon: "timer",
        title: "Evaluaciones con tiempo en servidor",
        description: "Exámenes cronometrados desde el servidor y autoguardado de respuestas: sin trampas ni pérdida de datos.",
      },
      {
        icon: "analytics",
        title: "Analíticas",
        description: "Tasa de finalización, notas promedio y actividad por curso para tomar decisiones con datos reales.",
      },
      {
        icon: "security",
        title: "Auditoría y seguridad",
        description: "Registro de cada acción relevante, acceso por roles y aislamiento de datos a nivel de base de datos.",
      },
      {
        icon: "progress",
        title: "Progreso y desbloqueo de módulos",
        description: "Tus alumnos avanzan a su ritmo y desbloquean el siguiente módulo al completar lo requerido.",
      },
    ],
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
        description: "Armá módulos con lecciones, quizzes y exámenes. Asigná profesores y abrí las inscripciones.",
      },
      {
        title: "Seguí el progreso",
        description: "Consultá analíticas por curso, corregí entregas y acompañá a cada alumno hasta la certificación.",
      },
    ],
  },
  roles: {
    eyebrow: "Roles",
    title: "Un espacio para cada persona",
    lead: "Cada rol ve solo lo que necesita, con permisos claros y una interfaz sin distracciones.",
    items: [
      {
        icon: "admin",
        title: "Administrador",
        description: "Gestioná la organización de punta a punta.",
        bullets: ["Miembros, grupos y links de registro", "Cursos, ofertas e inscripciones", "Analíticas y registro de auditoría"],
      },
      {
        icon: "teacher",
        title: "Profesor",
        description: "Enseñá y evaluá con herramientas simples.",
        bullets: ["Cursos asignados y contenido", "Evaluaciones y bancos de preguntas", "Corrección de entregas abiertas"],
      },
      {
        icon: "student",
        title: "Estudiante",
        description: "Aprendé a tu ritmo desde cualquier dispositivo.",
        bullets: ["Mis cursos y progreso por módulo", "Quizzes y exámenes con autoguardado", "Resultados y retroalimentación"],
      },
    ],
  },
  trust: {
    title: "Construida para la confianza",
    items: [
      { icon: "rls", title: "RLS por organización", description: "Aislamiento de datos aplicado en la base de datos." },
      { icon: "otp", title: "OTP sin contraseñas", description: "Acceso con código por correo, sin contraseñas que olvidar." },
      { icon: "audit", title: "Registro de auditoría", description: "Trazabilidad de cada acción relevante." },
      { icon: "a11y", title: "Accesible AA", description: "Diseñada según WCAG 2.1 nivel AA." },
    ],
  },
  footer: {
    login: "Iniciar sesión",
    navLabel: "Links del pie de página",
    rights: "Todos los derechos reservados.",
  },
} as const
