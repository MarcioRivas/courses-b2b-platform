import { createClient } from "@/lib/supabase/server"

export interface ModuleListItem {
  id: string
  title: string
  position: number
}

/** Used by the dependency editor to offer other modules of the same course as prerequisites. */
export async function listModules(courseId: string): Promise<ModuleListItem[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("modules")
    .select("id, title, position")
    .eq("course_id", courseId)
    .order("position", { ascending: true })
    .order("id", { ascending: true })

  if (error || !data) {
    return []
  }

  return data
}
