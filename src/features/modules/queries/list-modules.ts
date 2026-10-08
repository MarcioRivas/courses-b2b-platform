import { createClient } from "@/lib/supabase/server"

export interface ModuleListItem {
  id: string
  title: string
  position: number
}

/** Used by the dependency editor to offer other modules of the same edition as prerequisites. */
export async function listModules(offeringId: string): Promise<ModuleListItem[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("modules")
    .select("id, title, position")
    .eq("offering_id", offeringId)
    .order("position", { ascending: true })
    .order("id", { ascending: true })

  if (error || !data) {
    return []
  }

  return data
}
