import { LinkIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { contentMessages } from "@/lib/messages/admin-content"
import type { ModuleDependencyItem } from "./dependency-editor"

interface DependencyChipsProps {
  dependencies: ModuleDependencyItem[]
  /** Resolves a prerequisite module id to its title (falls back to the id). */
  moduleTitles: Record<string, string>
}

/** Compact "Requiere: …" chips shown on module rows and the module header. */
export function DependencyChips({ dependencies, moduleTitles }: DependencyChipsProps) {
  if (dependencies.length === 0) return null
  const labels = contentMessages.dependencies

  return (
    <ul className="flex flex-wrap gap-1.5" aria-label={labels.title}>
      {dependencies.map((dependency) => (
        <li key={dependency.id} className="min-w-0">
          <Badge variant="brand" className="max-w-[16rem]">
            <LinkIcon aria-hidden="true" />
            <span className="truncate">
              {dependency.condition === "MODULE_COMPLETED"
                ? labels.requiresChip(moduleTitles[dependency.dependsOnModuleId ?? ""] ?? dependency.dependsOnModuleId ?? "")
                : labels.quizChip(dependency.minScore ?? 0)}
            </span>
          </Badge>
        </li>
      ))}
    </ul>
  )
}
