import type { Database } from "@/types/database.types"

/** Roles with a bell: students and professors. Admin/platform shells have none (v1). */
export const NOTIFICATION_ROLES: Database["public"]["Enums"]["membership_role"][] = ["STUDENT", "PROFESSOR"]
