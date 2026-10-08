import { describe, expect, it } from "vitest"
import { psql } from "../helpers/sql"

/** B1 catalog guards: the course-level helpers are gone and nothing references them. */
describe("offering professors catalog", () => {
  it("is_course_professor and can_edit_course no longer exist", () => {
    const count = psql(
      "select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace " +
        "where n.nspname = 'public' and p.proname in ('is_course_professor', 'can_edit_course');"
    )
    expect(count).toBe("0")
  })

  it("no policy or function body references the old helpers or course_professors", () => {
    const policies = psql(
      "select count(*) from pg_policies where " +
        "coalesce(qual, '') ~ '(is_course_professor|can_edit_course\\(|course_professors)' or " +
        "coalesce(with_check, '') ~ '(is_course_professor|can_edit_course\\(|course_professors)';"
    )
    expect(policies).toBe("0")

    const functions = psql(
      "select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace " +
        "where n.nspname = 'public' and p.prosrc ~ '(is_course_professor|can_edit_course\\(|course_professors)';"
    )
    expect(functions).toBe("0")
  })

  it("the course_professors table is gone", () => {
    expect(psql("select to_regclass('public.course_professors') is null;")).toBe("t")
  })

  it("every new B1 function is SECURITY DEFINER with a locked search_path and no anon EXECUTE", () => {
    const names = [
      "is_offering_professor",
      "is_professor_of_any_edition",
      "can_edit_course_content",
      "search_assignable_professors",
      "freeze_offering_identity",
    ]
    const list = names.map((n) => `'${n}'`).join(",")
    const rows = psql(
      "select p.proname || ':' || p.prosecdef || ':' || coalesce(array_to_string(p.proconfig, ','), '') || ':' || " +
        "has_function_privilege('anon', p.oid, 'EXECUTE') from pg_proc p join pg_namespace n on n.oid = p.pronamespace " +
        `where n.nspname = 'public' and p.proname in (${list}) order by 1;`
    ).split("\n")
    expect(rows).toHaveLength(names.length)
    for (const row of rows) {
      expect(row).toMatch(/:true:search_path=public, pg_temp:false$/)
    }
  })
})
