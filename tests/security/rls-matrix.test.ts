import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { buildSecurityFixture, type SecurityFixture } from "./fixture"
import { cleanupScratchOrgs, runMatrixCase } from "./matrix-runner"
import { fullMatrixSpec, NO_WRITE_POLICY_TABLES } from "./rls-matrix-spec"
import { psql } from "../helpers/sql"

/**
 * The single most valuable artifact of Phase 7 (docs/authorization.md):
 * every public table × {select, insert, update, delete} × 7 roles, driven by
 * one 2-org/7-user fixture. Any unexpected ALLOW or unexpected DENY fails —
 * this matrix documents reality, not aspiration.
 */

let fx: SecurityFixture

beforeAll(async () => {
  fx = await buildSecurityFixture()
}, 60000)

afterAll(async () => {
  await fx.cleanup()
  await cleanupScratchOrgs()
})

describe("RLS matrix: table × operation × role", () => {
  for (const c of fullMatrixSpec()) {
    it(`${c.table} ${c.op} — allow=[${c.allow.join(",")}]`, async () => {
      await runMatrixCase(fx, c)
    })
  }
})

describe("no-direct-write tables: catalog confirms zero INSERT/UPDATE/DELETE policy for authenticated", () => {
  it(`${NO_WRITE_POLICY_TABLES.length} D24 tables have no write policy at all`, () => {
    const list = NO_WRITE_POLICY_TABLES.map((t) => `'${t}'`).join(",")
    const count = psql(
      `select count(*) from pg_policies where schemaname='public' and tablename in (${list}) ` +
        `and cmd in ('INSERT','UPDATE','DELETE') and roles @> ARRAY['authenticated']::name[];`
    )
    expect(count).toBe("0")
  })

  it("assessment_attempt_answer_keys has zero policies of any kind (C8)", () => {
    const count = psql(
      "select count(*) from pg_policies where schemaname='public' and tablename='assessment_attempt_answer_keys';"
    )
    expect(count).toBe("0")
  })
})
