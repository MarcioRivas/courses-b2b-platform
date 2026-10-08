import { notFound } from "next/navigation"
import { requireOrgRole } from "@/lib/auth/require-role"
import { PageHeader } from "@/components/shared/page-header"
import { EmptyState } from "@/components/shared/empty-state"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { Button } from "@/components/ui/button"
import { messages } from "@/lib/messages/es"
import { groupMessages } from "@/lib/messages/admin-groups"
import { getGroupWithMembers } from "@/features/groups/queries/get-group-with-members"
import { listAssignableStudents } from "@/features/groups/queries/list-assignable-students"
import { removeGroupMember } from "@/features/groups/actions/remove-group-member"
import { GroupForm } from "@/features/groups/components/group-form"
import { GroupMemberPicker } from "@/features/groups/components/group-member-picker"

interface GroupDetailPageProps {
  params: Promise<{ groupId: string }>
}

export default async function GroupDetailPage({ params }: GroupDetailPageProps) {
  const ctx = await requireOrgRole(["ADMIN"])
  const { groupId } = await params

  const group = await getGroupWithMembers(groupId)
  if (!group || group.organizationId !== ctx.organizationId) {
    return notFound()
  }

  const assignableStudents = await listAssignableStudents({ organizationId: ctx.organizationId, groupId })

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={group.name}
        description={group.description ?? undefined}
        breadcrumb={[{ label: groupMessages.list.title, href: "/admin/groups" }, { label: group.name }]}
      >
        <GroupForm mode="edit" group={group} trigger={<Button variant="outline">{messages.common.edit}</Button>} />
      </PageHeader>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">{groupMessages.detail.membersTitle}</h2>
        {group.members.length === 0 ? (
          <EmptyState title={groupMessages.detail.emptyMembers} />
        ) : (
          <ul className="flex flex-col gap-2">
            {group.members.map((member) => (
              <li key={member.id} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                <span>
                  {member.firstName} {member.lastName}
                </span>
                <ConfirmDialog
                  trigger={
                    <Button variant="ghost" size="sm">
                      {messages.common.delete}
                    </Button>
                  }
                  title={groupMessages.removeMember.title}
                  description={groupMessages.removeMember.description}
                  confirmLabel={messages.common.delete}
                  destructive
                  action={removeGroupMember}
                  input={{ groupId, userId: member.userId }}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">{groupMessages.detail.addMembersTitle}</h2>
        <GroupMemberPicker groupId={groupId} students={assignableStudents} />
      </section>
    </div>
  )
}
