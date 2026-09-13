import { createClient } from "@/lib/supabase/server"
import type { BankDetail } from "../types"

export async function getBank(bankId: string): Promise<BankDetail | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("question_banks")
    .select("id, organization_id, course_id, name, description, courses(title)")
    .eq("id", bankId)
    .maybeSingle()

  if (error || !data) {
    return null
  }

  return {
    id: data.id,
    organizationId: data.organization_id,
    courseId: data.course_id,
    courseTitle: data.courses?.title ?? null,
    name: data.name,
    description: data.description,
  }
}
