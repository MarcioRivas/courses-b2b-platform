import { describe, expect, it } from "vitest"
import { saveVideoCheckpointsSchema, answerCheckpointSchema, lessonCheckpointsSchema } from "@/features/video-checkpoints/schemas/video-checkpoint-schemas"

describe("video-checkpoint-schemas", () => {
  const blockId = "550e8400-e29b-41d4-a716-446655440000"
  const enrollmentId = "660e8400-e29b-41d4-a716-446655440000"
  const checkpointId = "770e8400-e29b-41d4-a716-446655440000"
  const questionId = "880e8400-e29b-41d4-a716-446655440000"
  const optionId = "990e8400-e29b-41d4-a716-446655440000"
  const lessonId = "aa0e8400-e29b-41d4-a716-446655440000"

  describe("saveVideoCheckpointsSchema", () => {
    const validCheckpoint = {
      atSeconds: 30,
      minCorrect: 1,
      questions: [
        {
          prompt: "Is this correct?",
          options: [
            { label: "Yes", isCorrect: true },
            { label: "No", isCorrect: false },
          ],
        },
      ],
    }

    it("accepts valid checkpoint data", () => {
      const result = saveVideoCheckpointsSchema.safeParse({
        blockId,
        checkpoints: [validCheckpoint],
      })
      expect(result.success).toBe(true)
    })

    it("accepts checkpoints with ids (on update)", () => {
      const result = saveVideoCheckpointsSchema.safeParse({
        blockId,
        checkpoints: [{ id: checkpointId, ...validCheckpoint }],
      })
      expect(result.success).toBe(true)
    })

    it("enforces exactly one correct option per question", () => {
      const result = saveVideoCheckpointsSchema.safeParse({
        blockId,
        checkpoints: [
          {
            atSeconds: 30,
            minCorrect: 1,
            questions: [
              {
                prompt: "Q?",
                options: [
                  { label: "A", isCorrect: false },
                  { label: "B", isCorrect: false },
                ],
              },
            ],
          },
        ],
      })
      expect(result.success).toBe(false)
      expect(result.error?.issues.some((i) => i.code === "custom")).toBe(true)
    })

    it("enforces exactly one correct option when multiple marked", () => {
      const result = saveVideoCheckpointsSchema.safeParse({
        blockId,
        checkpoints: [
          {
            atSeconds: 30,
            minCorrect: 1,
            questions: [
              {
                prompt: "Q?",
                options: [
                  { label: "A", isCorrect: true },
                  { label: "B", isCorrect: true },
                ],
              },
            ],
          },
        ],
      })
      expect(result.success).toBe(false)
    })

    it("enforces minCorrect <= questions.length", () => {
      const result = saveVideoCheckpointsSchema.safeParse({
        blockId,
        checkpoints: [
          {
            atSeconds: 30,
            minCorrect: 5,
            questions: [
              {
                prompt: "Q?",
                options: [
                  { label: "A", isCorrect: true },
                  { label: "B", isCorrect: false },
                ],
              },
            ],
          },
        ],
      })
      expect(result.success).toBe(false)
    })

    it("rejects duplicate checkpoint times", () => {
      const result = saveVideoCheckpointsSchema.safeParse({
        blockId,
        checkpoints: [
          {
            atSeconds: 30,
            minCorrect: 1,
            questions: [
              {
                prompt: "Q1?",
                options: [
                  { label: "Yes", isCorrect: true },
                  { label: "No", isCorrect: false },
                ],
              },
            ],
          },
          {
            atSeconds: 30,
            minCorrect: 1,
            questions: [
              {
                prompt: "Q2?",
                options: [
                  { label: "Yes", isCorrect: true },
                  { label: "No", isCorrect: false },
                ],
              },
            ],
          },
        ],
      })
      expect(result.success).toBe(false)
    })

    it("enforces min 1 second for checkpoint time", () => {
      const result = saveVideoCheckpointsSchema.safeParse({
        blockId,
        checkpoints: [{ atSeconds: 0, minCorrect: 1, questions: [validCheckpoint.questions[0]] }],
      })
      expect(result.success).toBe(false)
    })

    it("enforces max 43200 seconds (12 hours) for checkpoint time", () => {
      const result = saveVideoCheckpointsSchema.safeParse({
        blockId,
        checkpoints: [{ atSeconds: 43201, minCorrect: 1, questions: [validCheckpoint.questions[0]] }],
      })
      expect(result.success).toBe(false)
    })

    it("accepts max 20 checkpoints", () => {
      const checkpoints = Array.from({ length: 20 }, (_, i) => ({
        atSeconds: i * 10 + 10,
        minCorrect: 1,
        questions: [{ prompt: `Q${i}?`, options: [{ label: "Y", isCorrect: true }, { label: "N", isCorrect: false }] }],
      }))
      const result = saveVideoCheckpointsSchema.safeParse({ blockId, checkpoints })
      expect(result.success).toBe(true)
    })

    it("rejects more than 20 checkpoints", () => {
      const checkpoints = Array.from({ length: 21 }, (_, i) => ({
        atSeconds: i * 10 + 10,
        minCorrect: 1,
        questions: [{ prompt: `Q${i}?`, options: [{ label: "Y", isCorrect: true }, { label: "N", isCorrect: false }] }],
      }))
      const result = saveVideoCheckpointsSchema.safeParse({ blockId, checkpoints })
      expect(result.success).toBe(false)
    })

    it("enforces min 1 question per checkpoint", () => {
      const result = saveVideoCheckpointsSchema.safeParse({
        blockId,
        checkpoints: [{ atSeconds: 30, minCorrect: 1, questions: [] }],
      })
      expect(result.success).toBe(false)
    })

    it("enforces max 5 questions per checkpoint", () => {
      const questions = Array.from({ length: 6 }, (_, i) => ({
        prompt: `Q${i}?`,
        options: [
          { label: "Y", isCorrect: true },
          { label: "N", isCorrect: false },
        ],
      }))
      const result = saveVideoCheckpointsSchema.safeParse({
        blockId,
        checkpoints: [{ atSeconds: 30, minCorrect: 1, questions }],
      })
      expect(result.success).toBe(false)
    })

    it("enforces min 2 options per question", () => {
      const result = saveVideoCheckpointsSchema.safeParse({
        blockId,
        checkpoints: [
          {
            atSeconds: 30,
            minCorrect: 1,
            questions: [{ prompt: "Q?", options: [{ label: "Only", isCorrect: true }] }],
          },
        ],
      })
      expect(result.success).toBe(false)
    })

    it("enforces max 6 options per question", () => {
      const options = Array.from({ length: 7 }, (_, i) => ({ label: `Opt${i}`, isCorrect: i === 0 }))
      const result = saveVideoCheckpointsSchema.safeParse({
        blockId,
        checkpoints: [
          {
            atSeconds: 30,
            minCorrect: 1,
            questions: [{ prompt: "Q?", options }],
          },
        ],
      })
      expect(result.success).toBe(false)
    })

    it("requires non-empty prompt", () => {
      const result = saveVideoCheckpointsSchema.safeParse({
        blockId,
        checkpoints: [
          {
            atSeconds: 30,
            minCorrect: 1,
            questions: [{ prompt: "   ", options: [{ label: "Y", isCorrect: true }, { label: "N", isCorrect: false }] }],
          },
        ],
      })
      expect(result.success).toBe(false)
    })

    it("requires non-empty option labels", () => {
      const result = saveVideoCheckpointsSchema.safeParse({
        blockId,
        checkpoints: [
          {
            atSeconds: 30,
            minCorrect: 1,
            questions: [{ prompt: "Q?", options: [{ label: "   ", isCorrect: true }, { label: "N", isCorrect: false }] }],
          },
        ],
      })
      expect(result.success).toBe(false)
    })

    it("enforces max 300 chars for option labels", () => {
      const longLabel = "a".repeat(301)
      const result = saveVideoCheckpointsSchema.safeParse({
        blockId,
        checkpoints: [
          {
            atSeconds: 30,
            minCorrect: 1,
            questions: [{ prompt: "Q?", options: [{ label: longLabel, isCorrect: true }, { label: "N", isCorrect: false }] }],
          },
        ],
      })
      expect(result.success).toBe(false)
    })

    it("enforces max 1000 chars for prompt", () => {
      const longPrompt = "a".repeat(1001)
      const result = saveVideoCheckpointsSchema.safeParse({
        blockId,
        checkpoints: [
          {
            atSeconds: 30,
            minCorrect: 1,
            questions: [
              {
                prompt: longPrompt,
                options: [
                  { label: "Y", isCorrect: true },
                  { label: "N", isCorrect: false },
                ],
              },
            ],
          },
        ],
      })
      expect(result.success).toBe(false)
    })

    it("enforces valid UUID for blockId", () => {
      const result = saveVideoCheckpointsSchema.safeParse({
        blockId: "not-a-uuid",
        checkpoints: [validCheckpoint],
      })
      expect(result.success).toBe(false)
    })
  })

  describe("answerCheckpointSchema", () => {
    it("accepts valid answer data", () => {
      const result = answerCheckpointSchema.safeParse({
        enrollmentId,
        checkpointId,
        answers: [{ questionId, optionId }],
      })
      expect(result.success).toBe(true)
    })

    it("accepts empty answers array", () => {
      const result = answerCheckpointSchema.safeParse({
        enrollmentId,
        checkpointId,
        answers: [],
      })
      expect(result.success).toBe(true)
    })

    it("accepts multiple answers", () => {
      const result = answerCheckpointSchema.safeParse({
        enrollmentId,
        checkpointId,
        answers: [
          { questionId, optionId },
          { questionId: "bb0e8400-e29b-41d4-a716-446655440000", optionId: "cc0e8400-e29b-41d4-a716-446655440000" },
        ],
      })
      expect(result.success).toBe(true)
    })

    it("enforces max 5 answers", () => {
      const answers = Array.from({ length: 6 }, (_, i) => ({
        questionId: `q${i}-00000000-0000-0000-0000-000000000000`,
        optionId: `o${i}-00000000-0000-0000-0000-000000000000`,
      }))
      const result = answerCheckpointSchema.safeParse({
        enrollmentId,
        checkpointId,
        answers,
      })
      expect(result.success).toBe(false)
    })

    it("enforces valid UUID for enrollmentId", () => {
      const result = answerCheckpointSchema.safeParse({
        enrollmentId: "not-uuid",
        checkpointId,
        answers: [],
      })
      expect(result.success).toBe(false)
    })

    it("enforces valid UUID for checkpointId", () => {
      const result = answerCheckpointSchema.safeParse({
        enrollmentId,
        checkpointId: "not-uuid",
        answers: [],
      })
      expect(result.success).toBe(false)
    })

    it("enforces valid UUIDs for questionId and optionId", () => {
      const result = answerCheckpointSchema.safeParse({
        enrollmentId,
        checkpointId,
        answers: [{ questionId: "bad", optionId }],
      })
      expect(result.success).toBe(false)
    })
  })

  describe("lessonCheckpointsSchema", () => {
    it("accepts valid lesson data", () => {
      const result = lessonCheckpointsSchema.safeParse({
        enrollmentId,
        lessonId,
      })
      expect(result.success).toBe(true)
    })

    it("enforces valid UUID for enrollmentId", () => {
      const result = lessonCheckpointsSchema.safeParse({
        enrollmentId: "not-uuid",
        lessonId,
      })
      expect(result.success).toBe(false)
    })

    it("enforces valid UUID for lessonId", () => {
      const result = lessonCheckpointsSchema.safeParse({
        enrollmentId,
        lessonId: "not-uuid",
      })
      expect(result.success).toBe(false)
    })
  })
})
