import { TabNav } from "@/components/shared/tab-nav"
import { editionPaths, type EditionArea } from "@/lib/courses/edition-paths"
import { offeringMessages } from "@/lib/messages/admin-offerings"

export type OfferingTabKey = "detalle" | "contenido" | "examenes" | "profesores"

/**
 * Edition sub-tabs. Admin: Detalle, Contenido, Exámenes, Profesores.
 * Teach (no detail/professors pages): Contenido, Exámenes.
 */
export function OfferingTabs({
  courseId,
  offeringId,
  active,
  area = "admin",
}: {
  courseId: string
  offeringId: string
  active: OfferingTabKey
  area?: EditionArea
}) {
  const paths = editionPaths(area, { courseId, offeringId })
  const tabs = [
    { key: "detalle", label: offeringMessages.tabs.detail, href: paths.base },
    { key: "contenido", label: offeringMessages.tabs.content, href: paths.content },
    { key: "examenes", label: offeringMessages.tabs.exams, href: paths.exams },
    { key: "profesores", label: offeringMessages.tabs.professors, href: `${paths.base}/professors` },
  ]
  return (
    <TabNav
      label={offeringMessages.tabs.detail}
      active={active}
      tabs={area === "admin" ? tabs : tabs.filter((tab) => tab.key === "contenido" || tab.key === "examenes")}
    />
  )
}
