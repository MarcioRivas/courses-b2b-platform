import { createClient } from "@/lib/supabase/server"
import type { ModuleScheduleRow } from "../types"

/** Every module of the edition, left-joined (in memory) with this offering's schedule row, if any. */
export async function getOfferingSchedule(offeringId: string): Promise<ModuleScheduleRow[]> {
  const supabase = await createClient()

  const { data: modules } = await supabase
    .from("modules")
    .select("id, title, position")
    .eq("offering_id", offeringId)
    .order("position", { ascending: true })

  const { data: schedules } = await supabase
    .from("offering_module_schedules")
    .select("module_id, available_from, available_until")
    .eq("offering_id", offeringId)

  const scheduleByModule = new Map((schedules ?? []).map((s) => [s.module_id, s]))

  return (modules ?? []).map((module) => {
    const schedule = scheduleByModule.get(module.id)
    return {
      moduleId: module.id,
      moduleTitle: module.title,
      modulePosition: module.position,
      availableFrom: schedule?.available_from ?? null,
      availableUntil: schedule?.available_until ?? null,
    }
  })
}
