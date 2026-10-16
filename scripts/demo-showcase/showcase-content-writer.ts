import { readFile } from "node:fs/promises"
import path from "node:path"
import { randomUUID } from "node:crypto"
import { admin, must, type Json, type TablesInsert } from "./showcase-admin-client"
import type { BlockSeed, ModuleSeed, QuestionSeed } from "./showcase-course-content"

const BUCKET = "course-files"
const ASSETS_DIR = path.resolve(process.cwd(), "scripts/demo-showcase/assets")
const DAY_MS = 86_400_000

export interface EditionContext {
  organizationId: string
  courseId: string
  offeringId: string
  createdBy: string
}

/** Uploads each asset once per run under the edition's storage prefix; returns its object path. */
async function uploadAsset(ctx: EditionContext, asset: string, cache: Map<string, string>): Promise<{ path: string; size: number }> {
  const bytes = await readFile(path.join(ASSETS_DIR, asset))
  const cached = cache.get(asset)
  if (cached) return { path: cached, size: bytes.byteLength }

  const objectPath = `${ctx.organizationId}/${ctx.courseId}/${ctx.offeringId}/${randomUUID()}-${asset}`
  const contentType = asset.endsWith(".pdf") ? "application/pdf" : "image/png"
  const { error } = await admin.storage.from(BUCKET).upload(objectPath, bytes, { contentType, upsert: true })
  if (error) throw error
  cache.set(asset, objectPath)
  return { path: objectPath, size: bytes.byteLength }
}

export async function insertQuestions(assessmentId: string, questions: QuestionSeed[]): Promise<void> {
  for (const [index, item] of questions.entries()) {
    const question = must(
      await admin
        .from("questions")
        .insert({
          assessment_id: assessmentId,
          type: item.options ? "MULTIPLE_CHOICE" : "OPEN_ENDED",
          prompt: item.prompt,
          points: item.points,
          position: index + 1,
        })
        .select("id")
        .single(),
      "question"
    )
    if (!item.options) continue
    const { error } = await admin.from("question_options").insert(
      item.options.map((label, n) => ({ question_id: question.id, label, is_correct: n === 0, position: n + 1 }))
    )
    if (error) throw error
  }
}

/** QUIZ / TASK blocks own a published assessment, like the inline authoring wizard creates. */
async function createBlockAssessment(ctx: EditionContext, block: BlockSeed): Promise<string | null> {
  if (block.type !== "QUIZ" && block.type !== "TASK") return null
  const base = { organization_id: ctx.organizationId, offering_id: ctx.offeringId, status: "PUBLISHED" as const, created_by: ctx.createdBy, title: block.title, passing_score: 60 }
  const row: TablesInsert<"assessments"> =
    block.type === "QUIZ"
      ? { ...base, kind: "QUIZ" as const }
      : {
          ...base,
          kind: "TASK" as const,
          instructions: block.instructions,
          max_files: block.maxFiles,
          max_attempts: 1,
          allow_late_submissions: true,
          available_until: new Date(Date.now() + block.dueInDays * DAY_MS).toISOString(),
        }
  const assessment = must(await admin.from("assessments").insert(row).select("id").single(), block.title)
  if (block.type === "QUIZ") await insertQuestions(assessment.id, block.questions)
  return assessment.id
}

async function blockData(ctx: EditionContext, block: BlockSeed, cache: Map<string, string>): Promise<Json> {
  switch (block.type) {
    case "RICH_TEXT":
      return { html: block.html }
    case "YOUTUBE_VIDEO":
      return { videoId: block.videoId, title: block.title }
    case "EXTERNAL_LINK":
      return { url: block.url, title: block.title }
    case "PDF": {
      const file = await uploadAsset(ctx, block.asset, cache)
      return { path: file.path, filename: block.filename, sizeBytes: file.size }
    }
    case "IMAGE":
      return { path: (await uploadAsset(ctx, block.asset, cache)).path, alt: block.alt }
    case "QUIZ":
    case "TASK":
      return {}
  }
}

async function insertCheckpoints(ctx: EditionContext, blockId: string, block: BlockSeed): Promise<void> {
  if (block.type !== "YOUTUBE_VIDEO" || !block.checkpoints) return
  for (const checkpoint of block.checkpoints) {
    const cp = must(
      await admin
        .from("video_checkpoints")
        .insert({ organization_id: ctx.organizationId, block_id: blockId, at_seconds: checkpoint.atSeconds, min_correct: 1 })
        .select("id")
        .single(),
      "checkpoint"
    )
    const question = must(
      await admin.from("video_checkpoint_questions").insert({ checkpoint_id: cp.id, prompt: checkpoint.prompt, position: 1 }).select("id").single(),
      "checkpoint question"
    )
    const { error } = await admin.from("video_checkpoint_options").insert(
      checkpoint.options.map((label, index) => ({ question_id: question.id, label, is_correct: index === 0, position: index + 1 }))
    )
    if (error) throw error
  }
}

/** Writes modules → lessons → blocks, then the module dependencies. Returns the count of blocks written. */
export async function writeEditionContent(ctx: EditionContext, modules: ModuleSeed[]): Promise<number> {
  const moduleIds = new Map<string, string>()
  const quizIds = new Map<string, string>()
  const assetCache = new Map<string, string>()
  let blockCount = 0

  for (const [moduleIndex, seed] of modules.entries()) {
    const mod = must(
      await admin.from("modules").insert({ offering_id: ctx.offeringId, title: seed.title, description: seed.description, position: moduleIndex + 1 }).select("id").single(),
      seed.title
    )
    moduleIds.set(seed.key, mod.id)

    for (const [lessonIndex, lessonSeed] of seed.lessons.entries()) {
      const lesson = must(
        await admin.from("lessons").insert({ module_id: mod.id, title: lessonSeed.title, description: lessonSeed.description ?? null, position: lessonIndex + 1 }).select("id").single(),
        lessonSeed.title
      )

      for (const [blockIndex, block] of lessonSeed.blocks.entries()) {
        const assessmentId = await createBlockAssessment(ctx, block)
        if (block.type === "QUIZ" && assessmentId) quizIds.set(block.key, assessmentId)
        const row = must(
          await admin
            .from("lesson_content_blocks")
            .insert({
              lesson_id: lesson.id,
              type: block.type,
              position: blockIndex + 1,
              data: await blockData(ctx, block, assetCache),
              is_required: block.required ?? true,
              assessment_id: assessmentId,
            })
            .select("id")
            .single(),
          `${block.type} block`
        )
        await insertCheckpoints(ctx, row.id, block)
        blockCount += 1
      }
    }
  }

  for (const seed of modules) {
    for (const dependency of seed.dependsOn ?? []) {
      const row: TablesInsert<"module_dependencies"> =
        "afterModule" in dependency
          ? { module_id: moduleIds.get(seed.key)!, condition: "MODULE_COMPLETED" as const, depends_on_module_id: moduleIds.get(dependency.afterModule)! }
          : { module_id: moduleIds.get(seed.key)!, condition: "QUIZ_PASSED" as const, assessment_id: quizIds.get(dependency.quizPassed)!, min_score: dependency.minScore }
      const { error } = await admin.from("module_dependencies").insert(row)
      if (error) throw error
    }
  }

  return blockCount
}
