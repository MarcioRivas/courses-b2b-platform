import { describe, expect, it } from "vitest"
import { psqlBool } from "../helpers/sql"

/**
 * Inline-assessment authoring RPCs (`create_assessment_block`,
 * `save_assessment_questions`) are granted to `authenticated` only. Their
 * behavior (ownership, validation, atomicity) lives in
 * `inline-assessment-authoring.test.ts`.
 */
describe("anon cannot execute the authoring RPCs", () => {
  it("has_function_privilege('anon', ..., 'EXECUTE') is false for both", () => {
    expect(
      psqlBool("select has_function_privilege('anon', 'create_assessment_block(uuid,assessment_kind,boolean,jsonb)', 'EXECUTE');")
    ).toBe(false)
    expect(
      psqlBool("select has_function_privilege('anon', 'save_assessment_questions(uuid,jsonb,integer)', 'EXECUTE');")
    ).toBe(false)
  })

  it("authenticated can execute both", () => {
    expect(
      psqlBool("select has_function_privilege('authenticated', 'create_assessment_block(uuid,assessment_kind,boolean,jsonb)', 'EXECUTE');")
    ).toBe(true)
    expect(
      psqlBool("select has_function_privilege('authenticated', 'save_assessment_questions(uuid,jsonb,integer)', 'EXECUTE');")
    ).toBe(true)
  })
})

describe("dropped bank surface is gone", () => {
  it("question_banks / assessment_questions tables and bank RPCs no longer exist", () => {
    expect(psqlBool("select to_regclass('public.question_banks') is null;")).toBe(true)
    expect(psqlBool("select to_regclass('public.assessment_questions') is null;")).toBe(true)
    expect(psqlBool("select to_regprocedure('public.replace_question_options(uuid,jsonb)') is null;")).toBe(true)
    expect(psqlBool("select to_regprocedure('public.set_assessment_questions(uuid,jsonb)') is null;")).toBe(true)
  })
})
