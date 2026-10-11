import Link from "next/link"
import { requireOrgRole } from "@/lib/auth/require-role"
import { PageHeader } from "@/components/shared/page-header"
import { DataList } from "@/components/shared/data-list"
import { listProfessorStudents } from "@/features/transcript/queries/list-professor-students"
import { studentTranscriptMessages as t } from "@/lib/messages/student-transcript"
import type { ProfessorStudent } from "@/features/transcript/types"

/** Students enrolled in the professor's editions (names only, never contact data). */
export default async function TeachStudentsPage() {
  const ctx = await requireOrgRole(["PROFESSOR"])
  const students = await listProfessorStudents(ctx.user.id)

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t.students.title} description={t.students.description} />
      <DataList<ProfessorStudent>
        items={students}
        getRowKey={(s) => s.userId}
        emptyTitle={t.students.emptyTitle}
        emptyDescription={t.students.emptyDescription}
        titleColumn={{
          key: "name",
          header: t.students.nameHeader,
          cell: (s) => `${s.firstName} ${s.lastName}`.trim(),
        }}
        columns={[
          { key: "editions", header: t.students.editionsHeader, cell: (s) => s.editions.join(", ") },
          {
            key: "actions",
            header: t.students.actionsHeader,
            isActions: true,
            cell: (s) => (
              <Link href={`/teach/students/${s.userId}`} className="text-sm text-primary underline-offset-4 hover:underline">
                {t.students.viewAction}
              </Link>
            ),
          },
        ]}
      />
    </div>
  )
}
