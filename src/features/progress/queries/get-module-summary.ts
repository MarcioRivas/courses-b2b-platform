import { createClient } from "@/lib/supabase/server"

export interface ModuleSummary {
  moduleId: string
  totalRequired: number
  completedRequired: number
}

/** Per-module required/completed counts for the module list's progress text. */
export async function getModuleSummary(enrollmentId: string): Promise<Map<string, ModuleSummary>> {
  const supabase = await createClient()

  const { data, error } = await supabase.rpc("enrollment_module_summary", {
    p_enrollment: enrollmentId,
  })

  if (error || !data) {
    return new Map()
  }

  return new Map(
    data.map((row) => [
      row.module_id,
      {
        moduleId: row.module_id,
        totalRequired: row.total_required,
        completedRequired: row.completed_required,
      },
    ])
  )
}
