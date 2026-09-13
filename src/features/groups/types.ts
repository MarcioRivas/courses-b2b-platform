export interface GroupListItem {
  id: string
  name: string
  description: string | null
  memberCount: number
}

export interface GroupMemberRow {
  id: string
  userId: string
  firstName: string
  lastName: string
}

export interface GroupWithMembers {
  id: string
  name: string
  description: string | null
  organizationId: string
  members: GroupMemberRow[]
}

export interface AssignableStudent {
  userId: string
  firstName: string
  lastName: string
}
