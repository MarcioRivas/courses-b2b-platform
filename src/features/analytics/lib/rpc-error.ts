/**
 * Analytics RPCs assert `is_org_admin`/`is_platform_admin` first (D25) as a
 * safety net — the page's own `requireOrgRole`/`requirePlatformAdmin` guard
 * should always deny first, so `42501` here is expected-but-redundant and
 * maps to "nothing to show" (M1). `assessment_score_distribution` also
 * raises `P0002` (`no_data_found`, D25) for an assessment id that doesn't
 * exist or isn't visible to the caller — same "nothing to show" treatment.
 * Anything else (missing migration, outage, column drift) must surface as a
 * real error so the page renders `ErrorState` instead of silently hiding data.
 */
const BENIGN_CODES = new Set(["42501", "P0002"])

export function isBenignRpcError(code: string | undefined): boolean {
  return code !== undefined && BENIGN_CODES.has(code)
}
