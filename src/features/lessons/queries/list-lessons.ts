import { createClient } from "@/lib/supabase/server"

export interface LessonListItem {
  id: string
  title: string
  position: number
}

export async function listLessons(moduleId: string): Promise<LessonListItem[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("lessons")
    .select("id, title, position")
    .eq("module_id", moduleId)
    .order("position", { ascending: true })
    .order("id", { ascending: true })

  if (error || !data) {
    return []
  }

  return data
}
