import { TabNav } from "@/components/shared/tab-nav"
import { courseMessages } from "@/lib/messages/admin-courses"

export type CourseTabKey = "detalle" | "ediciones"

/** Course detail tabs shared by the course pages: Detalle, Ediciones. */
export function CourseTabs({ courseId, active }: { courseId: string; active: CourseTabKey }) {
  const base = `/admin/courses/${courseId}`
  return (
    <TabNav
      label={courseMessages.detail.detailTab}
      active={active}
      tabs={[
        { key: "detalle", label: courseMessages.detail.detailTab, href: base },
        { key: "ediciones", label: courseMessages.detail.offeringsTab, href: `${base}/offerings` },
      ]}
    />
  )
}
