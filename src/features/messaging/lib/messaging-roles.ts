import type { MemberRole } from "../types"

/** Every org role can message any other member of its org; platform admins cannot. */
export const MESSAGING_ROLES: MemberRole[] = ["ADMIN", "PROFESSOR", "STUDENT"]
