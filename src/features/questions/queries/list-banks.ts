import { createClient } from "@/lib/supabase/server"
import type { BankListItem } from "../types"

/** RLS (`question_banks_all`) already scopes to banks the caller may edit. */
export async function listBanks(organizationId: string): Promise<BankListItem[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("question_banks")
    .select("id, name, description, course_id, courses(title), questions(count)")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })

  if (error) {
    return []
  }

  return (data ?? []).map((bank) => ({
    id: bank.id,
    name: bank.name,
    description: bank.description,
    courseId: bank.course_id,
    courseTitle: bank.courses?.title ?? null,
    questionCount: bank.questions?.[0]?.count ?? 0,
  }))
}
