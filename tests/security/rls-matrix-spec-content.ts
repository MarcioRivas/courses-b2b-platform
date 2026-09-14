import type { MatrixCase } from "./matrix-runner"

/**
 * modules, module_dependencies, lessons, lesson_content_blocks.
 * `modules`/`lessons`/`lesson_content_blocks` have no DELETE policy for
 * `authenticated` — deletion is RPC-only (`delete_module`/`delete_lesson`/
 * `delete_content_block`, D22/C10 cascade guards) — allow=[] there is the
 * verified expectation, not a gap.
 */
export function contentSpec(): MatrixCase[] {
  return [
    { table: "modules", op: "select", allow: ["superAdmin", "adminA", "profA", "studentA"], target: (fx) => ({ id: fx.courseA.modules[0]!.id }) },
    {
      table: "modules",
      op: "insert",
      allow: ["superAdmin", "adminA", "profA"],
      payload: (fx) => ({ course_id: fx.courseA.courseId, title: "Matrix Module", position: 900 }),
    },
    {
      table: "modules",
      op: "update",
      allow: ["superAdmin", "adminA", "profA"],
      seed: (fx) => Promise.resolve({ course_id: fx.courseA.courseId, title: "Seed Module", position: 901 }),
      mutateColumn: "title",
      updatePayload: { title: "Renamed Module" },
    },
    {
      table: "modules",
      op: "delete",
      allow: [],
      seed: (fx, i) => Promise.resolve({ course_id: fx.courseA.courseId, title: `Del Module ${i}`, position: 950 + i }),
    },

    {
      table: "module_dependencies",
      op: "select",
      allow: ["superAdmin", "adminA", "profA", "studentA"],
      target: (fx) => ({ id: fx.moduleDependencyA }),
    },
    {
      table: "module_dependencies",
      op: "insert",
      allow: ["superAdmin", "adminA", "profA"],
      payload: (fx) => ({
        module_id: fx.courseA.modules[1]!.id,
        depends_on_module_id: fx.courseA.modules[0]!.id,
        condition: "MODULE_COMPLETED",
      }),
    },
    {
      table: "module_dependencies",
      op: "delete",
      allow: ["superAdmin", "adminA", "profA"],
      seed: (fx) =>
        Promise.resolve({
          module_id: fx.courseA.modules[1]!.id,
          depends_on_module_id: fx.courseA.modules[0]!.id,
          condition: "MODULE_COMPLETED",
        }),
    },

    {
      table: "lessons",
      op: "select",
      allow: ["superAdmin", "adminA", "profA", "studentA"],
      target: (fx) => ({ id: fx.courseA.modules[0]!.lessonId }),
    },
    {
      table: "lessons",
      op: "insert",
      allow: ["superAdmin", "adminA", "profA"],
      payload: (fx) => ({ module_id: fx.courseA.modules[0]!.id, title: "Matrix Lesson", position: 900 }),
    },
    {
      table: "lessons",
      op: "update",
      allow: ["superAdmin", "adminA", "profA"],
      seed: (fx) => Promise.resolve({ module_id: fx.courseA.modules[0]!.id, title: "Seed Lesson", position: 901 }),
      mutateColumn: "title",
      updatePayload: { title: "Renamed Lesson" },
    },
    {
      table: "lessons",
      op: "delete",
      allow: [],
      seed: (fx, i) => Promise.resolve({ module_id: fx.courseA.modules[0]!.id, title: `Del Lesson ${i}`, position: 950 + i }),
    },

    {
      table: "lesson_content_blocks",
      op: "select",
      allow: ["superAdmin", "adminA", "profA", "studentA"],
      target: (fx) => ({ id: fx.courseA.modules[0]!.blockIds[0]! }),
    },
    {
      table: "lesson_content_blocks",
      op: "insert",
      allow: ["superAdmin", "adminA", "profA"],
      payload: (fx) => ({
        lesson_id: fx.courseA.modules[0]!.lessonId,
        type: "RICH_TEXT",
        position: 900,
        data: { html: "<p>matrix</p>" },
        is_required: false,
      }),
    },
    {
      table: "lesson_content_blocks",
      op: "update",
      allow: ["superAdmin", "adminA", "profA"],
      seed: (fx) =>
        Promise.resolve({
          lesson_id: fx.courseA.modules[0]!.lessonId,
          type: "RICH_TEXT",
          position: 901,
          data: { html: "<p>seed</p>" },
          is_required: false,
        }),
      mutateColumn: "position",
      updatePayload: { position: 902 },
    },
    {
      table: "lesson_content_blocks",
      op: "delete",
      allow: [],
      seed: (fx, i) =>
        Promise.resolve({
          lesson_id: fx.courseA.modules[0]!.lessonId,
          type: "RICH_TEXT",
          position: 950 + i,
          data: { html: "<p>del</p>" },
          is_required: false,
        }),
    },
  ]
}
