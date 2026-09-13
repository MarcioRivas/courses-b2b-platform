import { describe, expect, it } from "vitest"
import { anonClient } from "../helpers/make-user"
import { psql, psqlBool } from "../helpers/sql"

describe("catalog assertions (RLS invariants, docs/authorization.md)", () => {
  it("postgres role has BYPASSRLS (SECURITY DEFINER RPCs can write D24 tables)", () => {
    expect(psqlBool("select rolbypassrls from pg_roles where rolname='postgres';")).toBe(true)
  })

  it("all 11 tenancy tables FORCE row level security", () => {
    const tables = [
      "organizations",
      "organization_settings",
      "score_scale_ranges",
      "profiles",
      "profile_private",
      "platform_admins",
      "organization_memberships",
      "organization_registration_links",
      "groups",
      "group_members",
      "audit_logs",
    ]
    const count = psql(
      `select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace ` +
        `where n.nspname='public' and c.relname in (${tables.map((t) => `'${t}'`).join(",")}) ` +
        `and c.relforcerowsecurity;`
    )
    expect(count).toBe(String(tables.length))
  })

  it("no INSERT/UPDATE/DELETE policy for authenticated on D24 tables present in P1", () => {
    const count = psql(
      "select count(*) from pg_policies where schemaname='public' " +
        "and tablename in ('organization_memberships','audit_logs','platform_admins') " +
        "and cmd in ('INSERT','UPDATE','DELETE') and roles @> ARRAY['authenticated']::name[];"
    )
    expect(count).toBe("0")
  })

  it("no public function grants EXECUTE to anon except get_registration_link_public (C2)", () => {
    // Supabase's default ACLs grant EXECUTE to anon on every new public
    // function regardless of `revoke ... from public` — anon must be
    // revoked explicitly on every SECURITY DEFINER / trigger function we
    // authored. Extension-owned functions (citext/pgcrypto/btree_gist, which
    // install into `public` and are PUBLIC-executable by design) are excluded
    // — they are not app RPCs and out of scope for this guard.
    const count = psql(
      "select count(*) from pg_proc p " +
        "join pg_namespace n on n.oid = p.pronamespace " +
        "left join pg_depend d on d.objid = p.oid and d.deptype = 'e' " +
        "where n.nspname = 'public' and d.objid is null " +
        "and has_function_privilege('anon', p.oid, 'EXECUTE') " +
        "and p.proname <> 'get_registration_link_public';"
    )
    expect(count).toBe("0")
  })

  it("anon cannot call complete_registration directly (C2)", async () => {
    const { error } = await anonClient().rpc("complete_registration", {
      p_token: "demo-link-org-a",
      p_first_name: "Anon",
      p_last_name: "Bypass",
      p_phone: "099000111",
      p_dni: "00000111",
    })
    expect(error?.code).toBe("42501")
  })
})
