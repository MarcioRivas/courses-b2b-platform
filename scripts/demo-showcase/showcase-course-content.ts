/**
 * Content of the showcase course used by `pnpm seed:showcase`: 8 modules that
 * between them use every block type (text, video with checkpoints, link, PDF,
 * image, quiz, task), optional blocks, and both kinds of module dependency.
 */

export interface QuestionSeed {
  prompt: string
  points: number
  /** Multiple choice when present; the first option is the correct one. Open-ended otherwise. */
  options?: string[]
}

export interface CheckpointSeed {
  atSeconds: number
  prompt: string
  options: string[]
}

export type BlockSeed = { required?: boolean } & (
  | { type: "RICH_TEXT"; html: string }
  | { type: "YOUTUBE_VIDEO"; videoId: string; title: string; checkpoints?: CheckpointSeed[] }
  | { type: "EXTERNAL_LINK"; url: string; title: string }
  | { type: "PDF"; asset: string; filename: string }
  | { type: "IMAGE"; asset: string; alt: string }
  | { type: "QUIZ"; key: string; title: string; questions: QuestionSeed[] }
  | { type: "TASK"; title: string; instructions: string; maxFiles: number; dueInDays: number }
)

export interface LessonSeed {
  title: string
  description?: string
  blocks: BlockSeed[]
}

export type DependencySeed = { afterModule: string } | { quizPassed: string; minScore: number }

export interface ModuleSeed {
  key: string
  title: string
  description: string
  dependsOn?: DependencySeed[]
  lessons: LessonSeed[]
}

const PDF_GUIDE = { type: "PDF", asset: "guia-planificacion-semanal.pdf", filename: "Guía de planificación semanal.pdf" } as const

export const SHOWCASE_MODULES: ModuleSeed[] = [
  {
    key: "intro",
    title: "Introducción al entrenamiento",
    description: "Bienvenida al curso y conceptos base.",
    lessons: [
      {
        title: "Bienvenida al curso",
        description: "Cómo está organizado el curso y qué vas a aprender.",
        blocks: [
          { type: "RICH_TEXT", html: "<h2>¡Bienvenido/a!</h2><p>En este curso vas a recorrer los <strong>fundamentos del entrenamiento deportivo</strong>: desde la planificación hasta la recuperación.</p><ul><li>8 módulos con videos, lecturas y actividades</li><li>Quizzes para repasar cada tema</li><li>Una tarea práctica y un examen final</li></ul>" },
          { type: "IMAGE", asset: "ciclo-de-entrenamiento.png", alt: "Ciclo de entrenamiento: carga, fatiga y adaptación" },
        ],
      },
      {
        title: "Principios del entrenamiento",
        blocks: [
          { type: "RICH_TEXT", html: "<h3>Los cuatro principios</h3><ol><li><strong>Sobrecarga progresiva:</strong> aumentar el estímulo de forma gradual.</li><li><strong>Especificidad:</strong> entrenar lo que el deporte demanda.</li><li><strong>Individualidad:</strong> cada deportista responde distinto.</li><li><strong>Reversibilidad:</strong> lo que no se entrena, se pierde.</li></ol><blockquote>El descanso también es parte del entrenamiento.</blockquote>" },
          {
            type: "YOUTUBE_VIDEO",
            videoId: "2tM1LFFxeKg",
            title: "¿Qué hace crecer a los músculos? (TED-Ed)",
            checkpoints: [
              { atSeconds: 30, prompt: "¿Qué necesita un músculo para adaptarse y crecer?", options: ["Estímulo y recuperación", "Solo más repeticiones", "Entrenar todos los días sin descanso"] },
              { atSeconds: 90, prompt: "¿Cuándo se produce la reparación del tejido muscular?", options: ["Durante el descanso", "Durante la entrada en calor", "Solo mientras se entrena"] },
            ],
          },
        ],
      },
    ],
  },
  {
    key: "physiology",
    title: "Fisiología del ejercicio",
    description: "Qué pasa en el cuerpo cuando entrenamos.",
    lessons: [
      {
        title: "Sistemas energéticos",
        blocks: [
          { type: "RICH_TEXT", html: "<h3>Tres sistemas, un mismo objetivo</h3><ul><li><strong>ATP-PC</strong> (0–10 s): sprint corto.</li><li><strong>Glucolítico</strong> (10 s–2 min): 400 metros.</li><li><strong>Aeróbico</strong> (más de 2 min): maratón.</li></ul>" },
          { type: "EXTERNAL_LINK", url: "https://www.who.int/news-room/fact-sheets/detail/physical-activity", title: "Recomendaciones de actividad física (OMS)" },
        ],
      },
      {
        title: "Frecuencia cardíaca y zonas",
        blocks: [
          { type: "IMAGE", asset: "zonas-frecuencia-cardiaca.png", alt: "Gráfico de las cinco zonas de frecuencia cardíaca" },
          { type: "RICH_TEXT", html: "<p>Las zonas se calculan sobre la <strong>frecuencia cardíaca máxima</strong>. La zona 2 es la base de la resistencia; las zonas 4 y 5 se usan en intervalos cortos.</p>" },
          {
            type: "QUIZ",
            key: "physiology-quiz",
            title: "Repaso: fisiología del ejercicio",
            questions: [
              { prompt: "¿Qué sistema energético predomina en un sprint de 8 segundos?", points: 1, options: ["ATP-PC", "Aeróbico", "Glucolítico"] },
              { prompt: "¿En qué zona se construye la base aeróbica?", points: 1, options: ["Zona 2", "Zona 5", "Zona 4"] },
              { prompt: "Una carrera continua de 40 minutos usa principalmente el sistema…", points: 1, options: ["Aeróbico", "ATP-PC", "Glucolítico"] },
            ],
          },
        ],
      },
    ],
  },
  {
    key: "planning",
    title: "Planificación",
    description: "Cómo organizar la temporada y la semana.",
    lessons: [
      {
        title: "Macro, meso y microciclos",
        blocks: [
          { type: "RICH_TEXT", html: "<h3>Niveles de planificación</h3><ul><li><strong>Macrociclo:</strong> la temporada completa.</li><li><strong>Mesociclo:</strong> bloques de 3 a 6 semanas.</li><li><strong>Microciclo:</strong> la semana de trabajo.</li></ul>" },
          PDF_GUIDE,
        ],
      },
      {
        title: "Lecturas recomendadas",
        description: "Material opcional para profundizar.",
        blocks: [
          { type: "EXTERNAL_LINK", url: "https://es.wikipedia.org/wiki/Periodizaci%C3%B3n_del_entrenamiento", title: "Periodización del entrenamiento (Wikipedia)", required: false },
          { type: "RICH_TEXT", html: "<p><em>Este contenido es opcional:</em> no cuenta para el progreso del curso.</p>", required: false },
        ],
      },
    ],
  },
  {
    key: "strength",
    title: "Fuerza y potencia",
    description: "Trabajo de fuerza aplicado al deporte.",
    dependsOn: [{ afterModule: "planning" }],
    lessons: [
      {
        title: "Fundamentos de la fuerza",
        blocks: [
          { type: "RICH_TEXT", html: "<h3>Tipos de fuerza</h3><p>Máxima, explosiva y de resistencia. Cada una se entrena con cargas y velocidades distintas.</p>" },
          { type: "YOUTUBE_VIDEO", videoId: "UItWltVZZmE", title: "Rutina de cuerpo completo para principiantes (20 min)" },
        ],
      },
      {
        title: "Actividad práctica",
        blocks: [
          { type: "RICH_TEXT", html: "<p>Usá la guía de planificación para armar tu propio microciclo y subilo en la tarea.</p>" },
          { type: "TASK", title: "Diseñá tu microciclo de fuerza", instructions: "Armá una semana de entrenamiento de fuerza para tu categoría.\nIncluí objetivos, ejercicios, series y repeticiones, y los días de descanso.\nSubilo en PDF o como imagen.", maxFiles: 2, dueInDays: 14 },
        ],
      },
    ],
  },
  {
    key: "endurance",
    title: "Resistencia",
    description: "Resistencia aeróbica e intermitente.",
    dependsOn: [{ quizPassed: "physiology-quiz", minScore: 60 }],
    lessons: [
      {
        title: "Entrenamiento intermitente (HIIT)",
        blocks: [
          { type: "RICH_TEXT", html: "<p>El HIIT alterna esfuerzos intensos con pausas cortas. Mejora la potencia aeróbica en poco tiempo.</p>" },
          { type: "YOUTUBE_VIDEO", videoId: "ml6cT4AZdqI", title: "HIIT de 30 minutos con entrada en calor" },
        ],
      },
      {
        title: "Resistencia de base",
        blocks: [
          { type: "RICH_TEXT", html: "<h3>Trabajo continuo</h3><p>Sesiones de 30 a 60 minutos en zona 2. Son la base sobre la que se construye todo lo demás.</p>" },
          { type: "YOUTUBE_VIDEO", videoId: "gC_L9qAHVJ8", title: "Entrenamiento de bajo impacto para principiantes", required: false },
        ],
      },
    ],
  },
  {
    key: "injuries",
    title: "Prevención de lesiones",
    description: "Entrada en calor, movilidad y vuelta a la competencia.",
    lessons: [
      {
        title: "Entrada en calor",
        blocks: [
          { type: "RICH_TEXT", html: "<h3>Protocolo de 10 minutos</h3><ol><li>Activación general (trote suave)</li><li>Movilidad articular</li><li>Ejercicios específicos del deporte</li><li>Aceleraciones progresivas</li></ol>" },
        ],
      },
      {
        title: "Lesiones frecuentes",
        blocks: [
          { type: "RICH_TEXT", html: "<p>Esguinces de tobillo, desgarros de isquiotibiales y tendinopatías son las más comunes. La prevención combina <strong>fuerza, movilidad y control de carga</strong>.</p>" },
          {
            type: "QUIZ",
            key: "injuries-quiz",
            title: "Repaso: prevención de lesiones",
            questions: [
              { prompt: "¿Qué conviene hacer antes de una sesión intensa?", points: 1, options: ["Una entrada en calor progresiva", "Estiramientos estáticos largos", "Empezar directo"] },
              { prompt: "Describí brevemente una estrategia para prevenir lesiones en tu deporte.", points: 2 },
            ],
          },
        ],
      },
    ],
  },
  {
    key: "nutrition",
    title: "Nutrición y recuperación",
    description: "Alimentación, hidratación y descanso.",
    dependsOn: [{ afterModule: "injuries" }],
    lessons: [
      {
        title: "Hidratación",
        blocks: [
          { type: "RICH_TEXT", html: "<p>Perder un <strong>2 % del peso corporal</strong> en líquidos ya reduce el rendimiento. Hidratate antes, durante y después.</p>" },
          { type: "EXTERNAL_LINK", url: "https://www.who.int/es/news-room/fact-sheets/detail/healthy-diet", title: "Alimentación sana (OMS)" },
        ],
      },
      {
        title: "Descanso y sueño",
        blocks: [
          { type: "RICH_TEXT", html: "<p>Dormir entre 7 y 9 horas es la herramienta de recuperación más efectiva y más barata.</p>" },
        ],
      },
    ],
  },
  {
    key: "closing",
    title: "Integración final",
    description: "Repaso general antes del examen.",
    dependsOn: [{ afterModule: "strength" }, { afterModule: "nutrition" }],
    lessons: [
      {
        title: "Repaso general",
        blocks: [
          { type: "RICH_TEXT", html: "<h2>¡Llegaste al final!</h2><p>Repasá los conceptos clave y, cuando estés listo/a, rendí el <strong>examen final</strong> desde la sección Evaluaciones del curso.</p>" },
          PDF_GUIDE,
        ],
      },
    ],
  },
]

export const SHOWCASE_EXAM = {
  title: "Examen final",
  description: "Evaluación integradora de todo el curso. Tenés 30 minutos y dos intentos.",
  durationMinutes: 30,
  maxAttempts: 2,
  passingScore: 60,
  questions: [
    { prompt: "¿Qué principio indica aumentar el estímulo de forma gradual?", points: 1, options: ["Sobrecarga progresiva", "Reversibilidad", "Especificidad"] },
    { prompt: "¿Cuál es el nivel de planificación que abarca una semana?", points: 1, options: ["Microciclo", "Mesociclo", "Macrociclo"] },
    { prompt: "¿Qué sistema energético predomina en esfuerzos de más de 2 minutos?", points: 1, options: ["Aeróbico", "ATP-PC", "Glucolítico"] },
    { prompt: "¿Cuántas horas de sueño se recomiendan para recuperarse bien?", points: 1, options: ["Entre 7 y 9", "Entre 4 y 5", "Más de 12"] },
    { prompt: "Explicá cómo combinarías fuerza y resistencia en una misma semana.", points: 3 },
  ] satisfies QuestionSeed[],
}
