import path from "node:path"
import { config } from "dotenv"
import { createClient } from "@supabase/supabase-js"
import type { Database, Json } from "../src/types/database.types"

config({ path: path.resolve(process.cwd(), ".env.local") })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local")
}

/**
 * Demo course content for manual testing. Writes with the service role, which
 * bypasses RLS — the same documented exception the test fixtures use. Nothing
 * here is a substitute for exercising the real flows through the UI; it exists
 * so the course, professor and enrollment screens have something to show.
 *
 * Idempotent: the demo courses are deleted by title and rebuilt on every run.
 */
const admin = createClient<Database>(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const ORG_A = "11111111-1111-1111-1111-111111111111"
const ORG_B = "22222222-2222-2222-2222-222222222222"
const GROUP_A = "11111111-1111-1111-1111-111111111112"
const GROUP_B = "22222222-2222-2222-2222-222222222223"

type BlockSeed =
  | { type: "RICH_TEXT"; html: string }
  | { type: "YOUTUBE_VIDEO"; videoId: string; title: string }
  | { type: "EXTERNAL_LINK"; url: string; title: string }

interface LessonSeed {
  title: string
  blocks: BlockSeed[]
}

interface ModuleSeed {
  title: string
  description: string
  lessons: LessonSeed[]
}

const PHYSICAL_COURSE: ModuleSeed[] = [
  {
    title: "Fundamentos",
    description: "Conceptos base antes de entrar a la cancha.",
    lessons: [
      {
        title: "Qué es la preparación física",
        blocks: [
          {
            type: "RICH_TEXT",
            html: "<h2>Objetivo del módulo</h2><p>Entender los <strong>principios</strong> del entrenamiento: carga, adaptación y descanso.</p><ul><li>Sobrecarga progresiva</li><li>Especificidad</li><li>Reversibilidad</li></ul>",
          },
          { type: "YOUTUBE_VIDEO", videoId: "dQw4w9WgXcQ", title: "Introducción al entrenamiento" },
        ],
      },
      {
        title: "Evaluación inicial",
        blocks: [
          {
            type: "RICH_TEXT",
            html: "<p>Antes de planificar hay que medir. Registrá los valores de cada jugador en la planilla.</p><blockquote>Sin línea de base no hay progreso medible.</blockquote>",
          },
          {
            type: "EXTERNAL_LINK",
            url: "https://www.who.int/news-room/fact-sheets/detail/physical-activity",
            title: "Recomendaciones de actividad física (OMS)",
          },
        ],
      },
    ],
  },
  {
    title: "Planificación semanal",
    description: "Cómo armar una semana de trabajo.",
    lessons: [
      {
        title: "Microciclos",
        blocks: [
          {
            type: "RICH_TEXT",
            html: "<h3>Estructura tipo</h3><p>Lunes fuerza, miércoles velocidad, viernes resistencia. Ajustá según el calendario de partidos.</p>",
          },
        ],
      },
    ],
  },
  {
    title: "Prevención de lesiones",
    description: "Trabajo preventivo y vuelta a la competencia.",
    lessons: [
      {
        title: "Entrada en calor",
        blocks: [
          {
            type: "RICH_TEXT",
            html: "<p>Diez minutos de activación general y específica antes de cada sesión.</p>",
          },
        ],
      },
    ],
  },
]

const REGULATION_COURSE: ModuleSeed[] = [
  {
    title: "Reglamento general",
    description: "Las reglas que todo árbitro debe dominar.",
    lessons: [
      {
        title: "Faltas y sanciones",
        blocks: [
          { type: "RICH_TEXT", html: "<p>Clasificación de faltas y criterio de sanción.</p>" },
        ],
      },
    ],
  },
]

function blockData(block: BlockSeed): Json {
  switch (block.type) {
    case "RICH_TEXT":
      return { html: block.html }
    case "YOUTUBE_VIDEO":
      return { videoId: block.videoId, title: block.title }
    case "EXTERNAL_LINK":
      return { url: block.url, title: block.title }
  }
}

async function deleteCourseByTitle(organizationId: string, title: string): Promise<void> {
  await admin.from("courses").delete().eq("organization_id", organizationId).eq("title", title)
}

interface EditionSeed {
  groupId: string
  name: string
  startsAt?: string
  endsAt?: string
}

/** Content belongs to the edition: the edition is created first and the modules hang from it. */
async function createCourse(
  organizationId: string,
  title: string,
  description: string,
  status: "DRAFT" | "PUBLISHED",
  modules: ModuleSeed[],
  edition: EditionSeed | null
): Promise<{ courseId: string; offeringId: string | null }> {
  await deleteCourseByTitle(organizationId, title)

  const { data: course, error } = await admin
    .from("courses")
    .insert({ organization_id: organizationId, title, description, status, access_type: "PRIVATE" })
    .select("id")
    .single()
  if (error || !course) throw error ?? new Error(`course ${title} not created`)

  let offeringId: string | null = null
  if (edition) {
    const { data: offering, error: offeringError } = await admin
      .from("course_offerings")
      .insert({
        course_id: course.id,
        organization_id: organizationId,
        kind: "GROUP",
        group_id: edition.groupId,
        name: edition.name,
        starts_at: edition.startsAt,
        ends_at: edition.endsAt,
      })
      .select("id")
      .single()
    if (offeringError || !offering) throw offeringError ?? new Error("offering not created")
    offeringId = offering.id
  }
  if (modules.length > 0 && !offeringId) throw new Error(`course ${title} has content but no edition`)

  for (const [moduleIndex, moduleSeed] of modules.entries()) {
    const { data: mod, error: moduleError } = await admin
      .from("modules")
      .insert({
        offering_id: offeringId!,
        title: moduleSeed.title,
        description: moduleSeed.description,
        position: moduleIndex + 1,
      })
      .select("id")
      .single()
    if (moduleError || !mod) throw moduleError ?? new Error("module not created")

    for (const [lessonIndex, lessonSeed] of moduleSeed.lessons.entries()) {
      const { data: lesson, error: lessonError } = await admin
        .from("lessons")
        .insert({ module_id: mod.id, title: lessonSeed.title, position: lessonIndex + 1 })
        .select("id")
        .single()
      if (lessonError || !lesson) throw lessonError ?? new Error("lesson not created")

      const rows = lessonSeed.blocks.map((block, index) => ({
        lesson_id: lesson.id,
        type: block.type,
        position: index + 1,
        data: blockData(block),
        is_required: true,
      }))

      const { error: blockError } = await admin.from("lesson_content_blocks").insert(rows)
      if (blockError) throw blockError
    }
  }

  if (status === "PUBLISHED") {
    await admin.from("courses").update({ published_at: new Date().toISOString() }).eq("id", course.id)
  }

  return { courseId: course.id, offeringId }
}

async function findUserIdByEmail(email: string): Promise<string> {
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 })
  if (error) throw error
  const found = data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase())
  if (!found) throw new Error(`Seed user ${email} not found — run pnpm db:reset first`)
  return found.id
}

/** Mirrors what `sync_offering_enrollments` would produce for the group roster. */
async function enrollGroup(courseId: string, offeringId: string, organizationId: string, groupId: string) {
  const { count: totalBlocks } = await admin
    .from("lesson_content_blocks")
    .select("id, lessons!inner(modules!inner(offering_id))", { count: "exact", head: true })
    .eq("lessons.modules.offering_id", offeringId)
    .eq("is_required", true)

  const { data: members } = await admin.from("group_members").select("user_id").eq("group_id", groupId)

  const rows = (members ?? []).map((m) => ({
    organization_id: organizationId,
    course_id: courseId,
    offering_id: offeringId,
    user_id: m.user_id,
    source: "GROUP_ASSIGNMENT" as const,
    total_blocks: totalBlocks ?? 0,
  }))

  if (rows.length > 0) {
    const { error } = await admin.from("course_enrollments").insert(rows)
    if (error) throw error
  }

  return rows.length
}

/** A published TASK linked from the edition's first lesson, so the file-submission flow can be tried right away. */
async function seedDemoTask(offeringId: string): Promise<void> {
  const { data: task, error } = await admin
    .from("assessments")
    .insert({
      organization_id: ORG_A,
      offering_id: offeringId,
      kind: "TASK",
      status: "PUBLISHED",
      title: "Plan semanal de entrenamiento",
      instructions:
        "Armá un microciclo de una semana para tu categoría.\nIncluí objetivos, cargas y días de descanso, y subilo en PDF o en una planilla.",
      max_files: 2,
      max_attempts: 1,
      passing_score: 60,
      allow_late_submissions: true,
      available_until: new Date(Date.now() + 14 * 86_400_000).toISOString(),
    })
    .select("id")
    .single()
  if (error || !task) throw error ?? new Error("task not created")

  const { data: lesson } = await admin
    .from("lessons")
    .select("id, modules!inner(offering_id, position)")
    .eq("modules.offering_id", offeringId)
    .order("position", { ascending: true })
    .limit(1)
    .single()
  if (!lesson) throw new Error("lesson not found")

  const { error: blockError } = await admin.from("lesson_content_blocks").insert({
    lesson_id: lesson.id,
    type: "TASK",
    position: 99,
    data: {},
    is_required: true,
    assessment_id: task.id,
  })
  if (blockError) throw blockError
}

/** Two checkpoints on the edition's first video, so the in-video quiz flow can be tried right away. */
async function seedDemoVideoCheckpoints(offeringId: string): Promise<void> {
  const { data: block } = await admin
    .from("lesson_content_blocks")
    .select("id, lessons!inner(modules!inner(offering_id))")
    .eq("type", "YOUTUBE_VIDEO")
    .eq("lessons.modules.offering_id", offeringId)
    .limit(1)
    .single()
  if (!block) throw new Error("demo video block not found")

  const checkpoints = [
    { at: 20, question: "¿Cuál es el objetivo principal de la preparación física?", options: ["Mejorar el rendimiento y prevenir lesiones", "Solo ganar masa muscular", "Reemplazar el entrenamiento técnico"] },
    { at: 45, question: "¿Qué conviene hacer antes de una sesión intensa?", options: ["Una entrada en calor progresiva", "Estiramientos estáticos largos", "Nada, empezar directo"] },
  ]

  for (const checkpoint of checkpoints) {
    const { data: cp, error } = await admin
      .from("video_checkpoints")
      .insert({ organization_id: ORG_A, block_id: block.id, at_seconds: checkpoint.at, min_correct: 1 })
      .select("id")
      .single()
    if (error || !cp) throw error ?? new Error("checkpoint not created")

    const { data: question } = await admin
      .from("video_checkpoint_questions")
      .insert({ checkpoint_id: cp.id, prompt: checkpoint.question, position: 1 })
      .select("id")
      .single()
    if (!question) throw new Error("checkpoint question not created")

    await admin.from("video_checkpoint_options").insert(
      checkpoint.options.map((label, index) => ({ question_id: question.id, label, is_correct: index === 0, position: index + 1 }))
    )
  }
}

async function main(): Promise<void> {
  const { courseId: physicalId, offeringId } = await createCourse(
    ORG_A,
    "Preparación Física Base",
    "Curso introductorio de preparación física para categorías formativas.",
    "PUBLISHED",
    PHYSICAL_COURSE,
    {
      groupId: GROUP_A,
      name: "Cohorte 2026",
      startsAt: new Date().toISOString(),
      endsAt: new Date(Date.now() + 90 * 86_400_000).toISOString(),
    }
  )
  const editionId = offeringId!
  console.log("seeded PUBLISHED course 'Preparación Física Base' (3 módulos, 4 lecciones, 6 bloques) in its edition 'Cohorte 2026'")

  await seedDemoTask(editionId)
  await seedDemoVideoCheckpoints(editionId)
  console.log("seeded 2 in-video checkpoints (0:20, 0:45) on the edition's first video")
  console.log("seeded PUBLISHED task 'Plan semanal de entrenamiento' (hasta 2 archivos, fecha límite en 14 días)")

  const { data: offering, error: offeringError } = await admin
    .from("course_offerings")
    .insert({
      course_id: physicalId,
      organization_id: ORG_A,
      kind: "GROUP",
      group_id: GROUP_A,
      name: "Cohorte 2026",
      starts_at: new Date().toISOString(),
      ends_at: new Date(Date.now() + 90 * 86_400_000).toISOString(),
    })
    .select("id")
    .single()
  if (offeringError || !offering) throw offeringError ?? new Error("offering not created")

  const professorId = await findUserIdByEmail("prof@club-a.test")
  const { error: professorError } = await admin
    .from("offering_professors")
    .insert({ offering_id: editionId, user_id: professorId })
  if (professorError) throw professorError
  console.log("assigned prof@club-a.test as professor of 'Cohorte 2026'")

  const enrolled = await enrollGroup(physicalId, editionId, ORG_A, GROUP_A)
  console.log(`enrolled the 'Cohorte 2026' roster (Grupo Principal) — ${enrolled} estudiantes inscriptos`)

  await createCourse(
    ORG_A,
    "Nutrición Deportiva",
    "Curso vacío a propósito: sirve para probar que publicar exige contenido.",
    "DRAFT",
    [],
    null
  )
  console.log("seeded DRAFT course 'Nutrición Deportiva' with no content (publish must refuse it)")

  await createCourse(
    ORG_B,
    "Reglamento y Arbitraje",
    "Curso de la otra organización, para verificar aislamiento entre tenants.",
    "PUBLISHED",
    REGULATION_COURSE,
    { groupId: GROUP_B, name: "Cohorte 2026" }
  )
  console.log("seeded PUBLISHED course 'Reglamento y Arbitraje' in Federación Demo")

  console.log("seed-demo-courses complete")
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
