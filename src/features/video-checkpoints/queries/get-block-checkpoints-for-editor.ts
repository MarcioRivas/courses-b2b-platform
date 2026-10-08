import "server-only"

import { createClient } from "@/lib/supabase/server"
import type { EditorCheckpoint } from "../types"

/**
 * A block's checkpoints with the answer key, for the editor. RLS
 * (`can_edit_course`) limits these tables to the course's editors; anyone else
 * gets an empty list.
 */
export async function getBlockCheckpointsForEditor(blockId: string): Promise<EditorCheckpoint[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("video_checkpoints")
    .select(
      `id, at_seconds, min_correct,
       video_checkpoint_questions(id, prompt, position,
         video_checkpoint_options(id, label, is_correct, position))`
    )
    .eq("block_id", blockId)
    .order("at_seconds", { ascending: true })

  if (error || !data) {
    return []
  }

  return data.map((checkpoint) => ({
    id: checkpoint.id,
    atSeconds: checkpoint.at_seconds,
    minCorrect: checkpoint.min_correct,
    questions: [...checkpoint.video_checkpoint_questions]
      .sort((a, b) => a.position - b.position)
      .map((question) => ({
        id: question.id,
        prompt: question.prompt,
        options: [...question.video_checkpoint_options]
          .sort((a, b) => a.position - b.position)
          .map((option) => ({ id: option.id, label: option.label, isCorrect: option.is_correct })),
      })),
  }))
}
