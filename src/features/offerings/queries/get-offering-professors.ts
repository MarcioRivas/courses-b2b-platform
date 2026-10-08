import { createClient } from "@/lib/supabase/server"
import type { OfferingProfessor } from "../types"

/** Assigned professors of one edition, name-sorted (small list, sorted in memory). */
export async function getOfferingProfessors(offeringId: string): Promise<OfferingProfessor[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("offering_professors")
    .select("user_id, profiles!offering_professors_user_id_fkey(first_name, last_name)")
    .eq("offering_id", offeringId)

  if (error) {
    return []
  }

  return (data ?? [])
    .map((row) => ({
      userId: row.user_id,
      firstName: row.profiles?.first_name ?? "",
      lastName: row.profiles?.last_name ?? "",
    }))
    .sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`, "es"))
}
