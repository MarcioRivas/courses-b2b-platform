import { readFileSync } from "node:fs"
import path from "node:path"
import { test, expect, type Page } from "@playwright/test"
import { loginViaOtp } from "../helpers/e2e-login"
import { supabaseAdmin } from "../helpers/supabase-admin"
import { makeUser, type TestUser } from "../helpers/make-user"
import { makeCourseFixture, enrollStudent, cleanupFixtures, assignOfferingProfessor } from "../helpers/course-fixtures"

/**
 * In-video checkpoints end to end, with a FAKE YouTube IFrame API (the real
 * one is network-dependent and can show ads): the fixture runs video time at
 * 10x and exposes a "fake-play" button.
 */

const ORG_A = "11111111-1111-1111-1111-111111111111"
const FAKE_API = readFileSync(path.join(__dirname, "../fixtures/fake-youtube-iframe-api.js"), "utf-8")

test.setTimeout(180_000)

const users: string[] = []
const courseIds: string[] = []
test.afterAll(async () => {
  await cleanupFixtures({ users, courseIds })
})

async function useFakeYoutube(page: Page, globals: Record<string, number> = {}) {
  await page.addInitScript((values) => Object.assign(window, values), { __FAKE_YT_DURATION__: 12, ...globals })
  await page.route("https://www.youtube.com/iframe_api", (route) =>
    route.fulfill({ contentType: "application/javascript", body: FAKE_API })
  )
}

/** A course with one lesson holding one required YouTube block, an enrolled student and optional checkpoints. */
async function videoLesson(label: string, checkpointsAt: number[]) {
  const stamp = Date.now()
  const student = await makeUser(`e2e-vc-${label}-${stamp}`, { organizationId: ORG_A, role: "STUDENT" })
  users.push(student.id)
  const course = await makeCourseFixture({
    organizationId: ORG_A,
    title: `Curso video ${label} ${stamp}`,
    modules: [{ title: "Módulo 1", requiredBlocks: 0 }],
  })
  courseIds.push(course.courseId)
  const lessonId = course.modules[0]!.lessonId
  const { data: block } = await supabaseAdmin
    .from("lesson_content_blocks")
    .insert({ lesson_id: lessonId, type: "YOUTUBE_VIDEO", position: 1, data: { videoId: "dQw4w9WgXcQ" }, is_required: true })
    .select("id")
    .single()

  for (const at of checkpointsAt) {
    const { data: cp } = await supabaseAdmin
      .from("video_checkpoints")
      .insert({ organization_id: ORG_A, block_id: block!.id, at_seconds: at, min_correct: 1 })
      .select("id")
      .single()
    const { data: q } = await supabaseAdmin
      .from("video_checkpoint_questions")
      .insert({ checkpoint_id: cp!.id, prompt: `¿Pregunta del segundo ${at}?`, position: 1 })
      .select("id")
      .single()
    await supabaseAdmin.from("video_checkpoint_options").insert([
      { question_id: q!.id, label: "Correcta", is_correct: true, position: 1 },
      { question_id: q!.id, label: "Incorrecta", is_correct: false, position: 2 },
    ])
  }

  const enrollmentId = await enrollStudent(course, ORG_A, student.id)
  return { student, course, lessonId, blockId: block!.id, enrollmentId, url: `/learn/courses/${enrollmentId}/lessons/${lessonId}` }
}

async function isCompleted(enrollmentId: string, blockId: string) {
  const { count } = await supabaseAdmin
    .from("content_progress")
    .select("id", { count: "exact", head: true })
    .eq("enrollment_id", enrollmentId)
    .eq("content_block_id", blockId)
  return count === 1
}

async function openAsStudent(page: Page, student: TestUser, url: string) {
  await loginViaOtp(page, student.email, "/learn")
  await page.goto(url)
}

test("student: the video stops at a checkpoint, the quiz blocks it, rewatch and pass resume it, the end completes it", async ({ page }) => {
  const lesson = await videoLesson("flow", [5])
  await useFakeYoutube(page)
  await openAsStudent(page, lesson.student, lesson.url)

  await expect(page.getByText("Preguntas del video: 0 de 1 superadas")).toBeVisible()
  await page.getByRole("button", { name: "fake-play" }).click()

  const dialog = page.getByRole("dialog")
  await expect(dialog.getByText("Pregunta del minuto 0:05")).toBeVisible()
  await expect(page.getByTestId("fake-yt")).toBeHidden()
  await page.keyboard.press("Escape")
  await expect(dialog).toBeVisible()

  await dialog.getByLabel("Incorrecta", { exact: true }).check()
  await dialog.getByRole("button", { name: "Responder" }).click()
  await expect(dialog.getByText("Acertaste 0 de 1 (necesitás 1).")).toBeVisible()

  // Rewatch: the dialog closes, the segment replays and the quiz comes back.
  await dialog.getByRole("button", { name: "Volver a ver el fragmento" }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByRole("dialog").getByText("Pregunta del minuto 0:05")).toBeVisible({ timeout: 10_000 })

  await page.getByRole("dialog").getByLabel("Correcta", { exact: true }).check()
  await page.getByRole("dialog").getByRole("button", { name: "Responder" }).click()
  await expect(page.getByText("¡Bien! Podés seguir mirando.")).toBeVisible()

  await expect(page.getByText("Video completado").first()).toBeVisible({ timeout: 10_000 })
  await expect.poll(() => isCompleted(lesson.enrollmentId, lesson.blockId)).toBe(true)
})

test("student: a video without checkpoints completes itself at the end, with no manual toggle", async ({ page }) => {
  const lesson = await videoLesson("plain", [])
  await useFakeYoutube(page)
  await openAsStudent(page, lesson.student, lesson.url)

  await expect(page.getByRole("button", { name: "Marcar como completado" })).toHaveCount(0)
  await page.getByRole("button", { name: "fake-play" }).click()
  await expect(page.getByText("Video completado").first()).toBeVisible({ timeout: 10_000 })
  await expect.poll(() => isCompleted(lesson.enrollmentId, lesson.blockId)).toBe(true)
})

test("student: a video that cannot be embedded lets them answer the questions, then complete manually", async ({ page }) => {
  const lesson = await videoLesson("embed", [5])
  await useFakeYoutube(page, { __FAKE_YT_ERROR__: 150 })
  await openAsStudent(page, lesson.student, lesson.url)

  await expect(page.getByText("Este video no se puede reproducir acá.")).toBeVisible()
  await expect(page.getByRole("link", { name: "Ver en YouTube" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Marcar como completado" })).toHaveCount(0)

  await page.getByRole("button", { name: "Responder las preguntas del video" }).click()
  await page.getByRole("dialog").getByLabel("Correcta", { exact: true }).check()
  await page.getByRole("dialog").getByRole("button", { name: "Responder" }).click()
  await expect(page.getByText("¡Bien! Podés seguir mirando.")).toBeVisible()

  await page.getByRole("button", { name: "Marcar como completado" }).click()
  await expect.poll(() => isCompleted(lesson.enrollmentId, lesson.blockId)).toBe(true)
})

test("professor: adds a checkpoint from the preview, saves it, and sees statistics", async ({ page }) => {
  const lesson = await videoLesson("editor", [])
  const professor = await makeUser(`e2e-vc-prof-${Date.now()}`, { organizationId: ORG_A, role: "PROFESSOR" })
  users.push(professor.id)
  await assignOfferingProfessor(lesson.course.offeringId, professor.id)

  await useFakeYoutube(page)
  await loginViaOtp(page, professor.email, "/teach")
  await page.goto(`/teach/courses/${lesson.course.courseId}/editions/${lesson.course.offeringId}/content/${lesson.course.modules[0]!.id}/${lesson.lessonId}`)
  await page.getByRole("listitem").getByRole("button", { name: "Editar", exact: true }).click()

  await expect(page.getByRole("heading", { name: "Preguntas en el video" })).toBeVisible()
  await page.getByRole("button", { name: "Agregar pregunta en este momento" }).click()
  await page.getByLabel("Pregunta 1").fill("¿Qué muestra el video?")
  await page.getByLabel("Opción 1").fill("Lo correcto")
  await page.getByLabel("Opción 2").fill("Otra cosa")
  await page.getByRole("button", { name: "Guardar preguntas" }).click()
  await expect(page.getByText("Preguntas del video guardadas.")).toBeVisible()

  // A student attempt (wrong, then right) so the stats have data.
  const { data: view } = await lesson.student.client.rpc("video_checkpoints_for_lesson", {
    p_enrollment: lesson.enrollmentId,
    p_lesson: lesson.lessonId,
  })
  const checkpoint = (view as unknown as Record<string, { id: string; questions: { id: string; options: { id: string; label: string }[] }[] }[]>)[lesson.blockId]![0]!
  const question = checkpoint.questions[0]!
  const pick = (label: string) => [{ questionId: question.id, optionId: question.options.find((o) => o.label === label)!.id }]
  await lesson.student.client.rpc("answer_video_checkpoint", { p_enrollment: lesson.enrollmentId, p_checkpoint: checkpoint.id, p_answers: pick("Otra cosa") })
  await lesson.student.client.rpc("answer_video_checkpoint", { p_enrollment: lesson.enrollmentId, p_checkpoint: checkpoint.id, p_answers: pick("Lo correcto") })

  await page.reload()
  await page.getByRole("listitem").getByRole("button", { name: "Editar", exact: true }).click()
  await expect(page.getByLabel("Pregunta 1")).toHaveValue("¿Qué muestra el video?")
  await page.getByRole("button", { name: "Estadísticas" }).click()
  await expect(page.getByText("Llegaron 1 de 1 estudiantes")).toBeVisible()
  await expect(page.getByText("Aprobaron 100% (0% al primer intento)")).toBeVisible()
  await expect(page.getByText("Respuestas incorrectas: 50%")).toBeVisible()
})
