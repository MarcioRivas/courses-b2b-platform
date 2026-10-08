import { notFound } from "next/navigation"
import { requireOrgRole } from "@/lib/auth/require-role"
import { PageHeader } from "@/components/shared/page-header"
import { getMember } from "@/features/users/queries/get-member"
import { RoleBadge } from "@/features/users/components/role-badge"
import { MemberRoleDialog } from "@/features/users/components/member-role-dialog"
import { MemberProfileDialog } from "@/features/users/components/member-profile-dialog"
import { MemberStatusToggle } from "@/features/users/components/member-status-toggle"
import { Badge } from "@/components/ui/badge"
import { messages } from "@/lib/messages/es"
import { adminMembersMessages } from "@/lib/messages/admin-members"

interface AdminMemberDetailPageProps {
  params: Promise<{ userId: string }>
}

export default async function AdminMemberDetailPage({ params }: AdminMemberDetailPageProps) {
  const ctx = await requireOrgRole(["ADMIN"])
  const { userId } = await params

  const member = await getMember(ctx.organizationId, userId)
  if (!member) {
    notFound()
  }

  const fullName = `${member.firstName} ${member.lastName}`.trim()
  const isSelf = member.userId === ctx.user.id
  // The RPC refuses org admins editing ADMIN members (profiles are global); only platform admins may.
  const canEditProfile = member.role !== "ADMIN" || ctx.isPlatformAdmin

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={fullName}
        breadcrumb={[{ label: adminMembersMessages.title, href: "/admin/members" }, { label: fullName }]}
      >
        <div className="flex items-center gap-2">
          <RoleBadge role={member.role} />
          <Badge variant={member.status === "ACTIVE" ? "secondary" : "outline"}>
            {messages.memberStatus[member.status]}
          </Badge>
        </div>
      </PageHeader>

      <div className="flex items-center gap-2">
        {canEditProfile && (
          <MemberProfileDialog
            userId={member.userId}
            organizationId={ctx.organizationId}
            memberName={fullName}
            initial={{
              firstName: member.firstName,
              lastName: member.lastName,
              phone: member.phone ?? "",
              dni: member.dni ?? "",
            }}
          />
        )}
        {!isSelf && (
          <>
            <MemberRoleDialog
              membershipId={member.membershipId}
              memberName={fullName}
              currentRole={member.role}
              organizationId={ctx.organizationId}
            />
            <MemberStatusToggle
              membershipId={member.membershipId}
              memberName={fullName}
              status={member.status}
              organizationId={ctx.organizationId}
            />
          </>
        )}
      </div>

      <section className="rounded-lg border p-4">
        <h2 className="mb-3 text-sm font-semibold">{adminMembersMessages.detail.contactTitle}</h2>
        <dl className="flex flex-col gap-2 text-sm">
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">{adminMembersMessages.detail.emailLabel}</dt>
            <dd>{member.email ?? "—"}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">{adminMembersMessages.detail.phoneLabel}</dt>
            <dd>{member.phone ?? "—"}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">{adminMembersMessages.detail.dniLabel}</dt>
            <dd>{member.dni ?? "—"}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">{adminMembersMessages.detail.joinedLabel}</dt>
            <dd>{new Date(member.joinedAt).toLocaleDateString("es-UY")}</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-lg border p-4">
        <h2 className="mb-3 text-sm font-semibold">{adminMembersMessages.detail.groupsTitle}</h2>
        {member.groups.length === 0 ? (
          <p className="text-sm text-muted-foreground">{adminMembersMessages.detail.noGroups}</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {member.groups.map((group) => (
              <li key={group.id}>{group.name}</li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
