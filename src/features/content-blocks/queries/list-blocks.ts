import { createClient } from "@/lib/supabase/server"
import type { Database, Json } from "@/types/database.types"

export interface BlockListItem {
  id: string
  type: Database["public"]["Enums"]["content_block_type"]
  position: number
  data: Json
  isRequired: boolean
}

export async function listBlocks(lessonId: string): Promise<BlockListItem[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("lesson_content_blocks")
    .select("id, type, position, data, is_required")
    .eq("lesson_id", lessonId)
    .order("position", { ascending: true })
    .order("id", { ascending: true })

  if (error || !data) {
    return []
  }

  return data.map((block) => ({
    id: block.id,
    type: block.type,
    position: block.position,
    data: block.data,
    isRequired: block.is_required,
  }))
}
