/**
 * Decorative marketing copy for the auth split-screen brand panel (Phase 03).
 * Kept apart from `es.ts` so frozen auth/E2E strings never drift.
 */
export const authBrandMessages = {
  tagline: "Plataforma para organizaciones deportivas",
  headline: "Formá a tu equipo desde un solo lugar",
  subheadline:
    "Cursos, evaluaciones y seguimiento para clubes, federaciones y academias.",
  valueProps: [
    {
      title: "Acceso seguro sin contraseñas",
      description: "Ingresá con un código de un solo uso enviado a tu correo.",
    },
    {
      title: "Aprendé a tu ritmo",
      description: "Contenido disponible en cualquier momento y dispositivo.",
    },
    {
      title: "Progreso visible",
      description: "Métricas claras para estudiantes, profesores y administradores.",
    },
  ],
  backToLanding: "Volver al inicio",
  copyright: (year: number, appName: string) => `© ${year} ${appName}`,
} as const
