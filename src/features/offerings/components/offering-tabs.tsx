import { TabNav } from "@/components/shared/tab-nav"
import { offeringMessages } from "@/lib/messages/admin-offerings"

export type OfferingTabKey = "detalle" | "profesores"

/** Edition sub-tabs: Detalle and Profesores. */
export function OfferingTabs({
  courseId,
  offeringId,
  active,
}: {
  courseId: string
  offeringId: string
  active: OfferingTabKey
}) {
  const base = `/admin/courses/${courseId}/offerings/${offeringId}`
  return (
    <TabNav
      label={offeringMessages.tabs.detail}
      active={active}
      tabs={[
        { key: "detalle", label: offeringMessages.tabs.detail, href: base },
        { key: "profesores", label: offeringMessages.tabs.professors, href: `${base}/professors` },
      ]}
    />
  )
}
