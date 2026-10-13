import { describe, expect, it } from "vitest"
import { psql } from "../helpers/sql"

/** B2 catalog guards: course-level content helpers and columns are gone and nothing references them. */
describe("edition content catalog", () => {
  const dropped = [
    "can_edit_course_content",
    "course_id_of_block",
    "course_id_of_lesson",
    "course_id_of_module",
    "can_write_course_file",
    "required_block_count",
    "refresh_course_enrollment_totals",
    "video_checkpoint_course",
  ]

  it("the course-level helpers no longer exist", () => {
    const list = dropped.map((n) => `'${n}'`).join(",")
    const count = psql(
      "select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace " +
        `where n.nspname = 'public' and p.proname in (${list});`
    )
    expect(count).toBe("0")
  })

  it("modules and assessments have no course_id column and a NOT NULL offering_id", () => {
    expect(
      psql(
        "select count(*) from information_schema.columns where table_schema = 'public' " +
          "and table_name in ('modules', 'assessments') and column_name = 'course_id';"
      )
    ).toBe("0")
    expect(
      psql(
        "select count(*) from information_schema.columns where table_schema = 'public' " +
          "and table_name in ('modules', 'assessments') and column_name = 'offering_id' and is_nullable = 'NO';"
      )
    ).toBe("2")
  })

  it("no policy or function body references the dropped helpers", () => {
    // `required_block_count` must not match `required_block_count_for_offering`.
    const pattern = `(${dropped.join("|")})(?![a-z_])`
    const policies = psql(
      "select count(*) from pg_policies where " +
        `coalesce(qual, '') ~ '${pattern}' or coalesce(with_check, '') ~ '${pattern}';`
    )
    expect(policies).toBe("0")

    const functions = psql(
      "select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace " +
        `where n.nspname = 'public' and p.prosrc ~ '${pattern}';`
    )
    expect(functions).toBe("0")
  })

  it("no function body reads the dropped modules/assessments course_id", () => {
    const functions = psql(
      "select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace " +
        "where n.nspname = 'public' and p.prosrc ~ '(\\m(m|a|modules|assessments)\\.course_id|from modules where course_id|from assessments where course_id)';"
    )
    expect(functions).toBe("0")
  })

  it("leaves no overloads of the rewritten functions", () => {
    const overloaded = psql(
      "select count(*) from (select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace " +
        "left join pg_depend d on d.objid = p.oid and d.deptype = 'e' " +
        "where n.nspname = 'public' and d.objid is null group by proname having count(*) > 1) t;"
    )
    expect(overloaded).toBe("0")
  })

  it("every B2 helper is SECURITY DEFINER with a locked search_path and no anon EXECUTE", () => {
    const names = [
      "can_edit_offering",
      "student_can_view_offering",
      "offering_id_of_module",
      "offering_id_of_lesson",
      "offering_id_of_block",
      "offering_id_of_assessment",
      "course_id_of_offering",
      "required_block_count_for_offering",
      "refresh_offering_enrollment_totals",
      "copy_edition_content",
      "create_course",
      "can_write_offering_file",
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

  it("internal functions are not executable by authenticated", () => {
    for (const signature of ["copy_edition_content(uuid, uuid)", "refresh_offering_enrollment_totals(uuid)", "assert_subtree_deletable(uuid, uuid, uuid)"]) {
      expect(psql(`select has_function_privilege('authenticated', '${signature}', 'EXECUTE');`)).toBe("f")
    }
  })

  it("the same-edition and lock triggers exist", () => {
    const triggers = psql(
      "select string_agg(distinct tgname, ',' order by tgname) from pg_trigger where not tgisinternal and tgname in (" +
        "'assert_block_assessment_same_edition','assert_dependency_same_edition','assert_module_edition_stable'," +
        "'assert_assessment_edition_stable','assert_course_access_type_unlocked','assert_block_assessment_kind','questions_task_guard');"
    )
    expect(triggers).toBe(
      "assert_assessment_edition_stable,assert_block_assessment_kind,assert_block_assessment_same_edition," +
        "assert_course_access_type_unlocked,assert_dependency_same_edition,assert_module_edition_stable,questions_task_guard"
    )
  })
})
