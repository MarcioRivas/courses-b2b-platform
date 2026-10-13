import { createClient } from "@/lib/supabase/server"
import type { ExamListItem } from "../types"

/** The edition's EXAMs (QUIZ/TASK live inside their content block). RLS scopes to editors/viewers. */
export async function listExams(offeringId: string): Promise<ExamListItem[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("assessments")
    .select("id, title, status, available_from, available_until, random_question_count, questions(count)")
    .eq("offering_id", offeringId)
    .eq("kind", "EXAM")
    .order("available_from", { ascending: true, nullsFirst: false })

  if (error) {
    return []
  }

  return (data ?? []).map((exam) => ({
    id: exam.id,
    title: exam.title,
    status: exam.status,
    availableFrom: exam.available_from,
    availableUntil: exam.available_until,
    questionCount: exam.questions?.[0]?.count ?? 0,
    randomQuestionCount: exam.random_question_count,
  }))
}
