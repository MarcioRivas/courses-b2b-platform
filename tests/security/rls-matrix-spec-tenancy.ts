import { randomUUID } from "node:crypto"
import { scratchOrg, scratchOrgForAdminA, type MatrixCase } from "./matrix-runner"

/**
 * organizations, organization_settings, score_scale_ranges,
 * organization_registration_links: platform-admin / org-admin write surface.
 * profiles, profile_private, platform_admins, organization_memberships:
 * SELECT-only for `authenticated` — write absence is asserted once via
 * catalog query in rls-matrix.test.ts, not simulated per role here.
 */
export function tenancySpec(): MatrixCase[] {
  return [
    {
      table: "organizations",
      op: "select",
      allow: ["superAdmin", "adminA", "profA", "studentA"],
      target: (fx) => ({ id: fx.orgA }),
    },
    {
      table: "organizations",
      op: "insert",
      allow: ["superAdmin"],
      payload: () => ({ name: "Matrix Org", slug: `matrix-org-${randomUUID()}`, status: "ACTIVE" }),
    },
    {
      table: "organizations",
      op: "update",
      allow: ["superAdmin"],
      seed: async () => ({ name: "Matrix Org Upd", slug: `matrix-org-upd-${randomUUID()}`, status: "ACTIVE" }),
      mutateColumn: "name",
      updatePayload: { name: "Renamed Org" },
    },
    {
      table: "organizations",
      op: "delete",
      allow: ["superAdmin"],
      seed: async (_fx, i) => ({ name: `Matrix Org Del ${i}`, slug: `matrix-org-del-${i}-${randomUUID()}`, status: "ACTIVE" }),
    },

    {
      table: "organization_settings",
      op: "select",
      keyColumns: ["organization_id"],
      allow: ["adminA", "profA", "studentA"],
      target: (fx) => ({ organization_id: fx.orgA }),
    },
    {
      // fx.orgA already has a settings row (fixture.ts) — inserting against it
      // would hit the PK conflict before RLS gets a chance to deny (M2). A
      // fresh settings-less scratch org keeps this a genuine RLS/grant proof.
      table: "organization_settings",
      op: "insert",
      keyColumns: ["organization_id"],
      allow: [],
      payload: async () => ({ organization_id: await scratchOrg() }),
    },
    {
      // Postgres layers the table's SELECT policy on top of the UPDATE
      // policy for row visibility (documented RLS behavior, not app-
      // specific): organization_settings SELECT is is_org_member-only, so a
      // platform admin who isn't a member of this org is filtered out even
      // though is_org_admin() (the UPDATE policy) says yes. See
      // security-review.md.
      table: "organization_settings",
      op: "update",
      keyColumns: ["organization_id"],
      allow: ["adminA"],
      seed: async (fx) => ({ organization_id: await scratchOrgForAdminA(fx) }),
      mutateColumn: "timezone",
      updatePayload: { timezone: "America/Argentina/Buenos_Aires" },
    },
    {
      table: "organization_settings",
      op: "delete",
      keyColumns: ["organization_id"],
      allow: [],
      seed: async () => ({ organization_id: await scratchOrg() }),
    },

    {
      table: "score_scale_ranges",
      op: "select",
      allow: ["adminA", "profA", "studentA"],
      target: (fx) => ({ id: fx.scoreRangeA }),
    },
    {
      // Same SELECT-layering caveat as organization_settings: SELECT is
      // is_org_member-only, so the platform admin is excluded from write
      // round trips here despite is_org_admin() covering the INSERT/UPDATE/
      // DELETE policy itself. See security-review.md.
      table: "score_scale_ranges",
      op: "insert",
      allow: ["adminA"],
      payload: (fx) => ({ organization_id: fx.orgA, min_score: 0, max_score: 59, label: "No aprobado" }),
    },
    {
      // fx.orgA already owns 60-100 (Aprobado) — pick a disjoint sub-range so
      // the exclusion constraint doesn't collide with the fixture's own row.
      table: "score_scale_ranges",
      op: "update",
      allow: ["adminA"],
      seed: (fx) => Promise.resolve({ organization_id: fx.orgA, min_score: 0, max_score: 10, label: "Rango" }),
      mutateColumn: "label",
      updatePayload: { label: "Rango actualizado" },
    },
    {
      table: "score_scale_ranges",
      op: "delete",
      allow: ["adminA"],
      seed: (fx, i) => Promise.resolve({ organization_id: fx.orgA, min_score: 11 + i, max_score: 11 + i, label: `Rango ${i}` }),
    },

    {
      table: "organization_registration_links",
      op: "select",
      allow: ["superAdmin", "adminA"],
      target: (fx) => ({ id: fx.linkA.id }),
    },
    {
      table: "organization_registration_links",
      op: "insert",
      allow: ["superAdmin", "adminA"],
      payload: (fx) => ({ organization_id: fx.orgA, label: "Matrix link", default_role: "STUDENT" }),
    },
    {
      table: "organization_registration_links",
      op: "update",
      allow: ["superAdmin", "adminA"],
      seed: async (fx) => ({ organization_id: fx.orgA, label: "Seed link", default_role: "STUDENT" }),
      mutateColumn: "label",
      updatePayload: { label: "Updated link" },
    },
    {
      table: "organization_registration_links",
      op: "delete",
      allow: ["superAdmin", "adminA"],
      seed: async (fx, i) => ({ organization_id: fx.orgA, label: `Del link ${i}`, default_role: "STUDENT" }),
    },

    {
      table: "profiles",
      op: "select",
      allow: ["superAdmin", "adminA", "profA", "studentA"],
      target: (fx) => ({ id: fx.users.studentA.id }),
    },
    {
      table: "profile_private",
      op: "select",
      keyColumns: ["user_id"],
      allow: ["superAdmin", "adminA", "studentA"],
      target: (fx) => ({ user_id: fx.users.studentA.id }),
    },
    {
      table: "platform_admins",
      op: "select",
      keyColumns: ["user_id"],
      allow: ["superAdmin"],
      target: (fx) => ({ user_id: fx.users.superAdmin.id }),
    },
    {
      table: "organization_memberships",
      op: "select",
      allow: ["superAdmin", "adminA", "studentA"],
      target: (fx) => ({ id: fx.membershipStudentA }),
    },
  ]
}
