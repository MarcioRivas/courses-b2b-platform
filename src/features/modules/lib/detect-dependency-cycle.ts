/**
 * Pure DFS cycle check for module dependency edges (C9). The DB only rejects a
 * direct self-reference (`module_dependencies_no_self_check`); a transitive
 * cycle (A→B→C→A) is only caught here, before the row is ever inserted.
 *
 * An edge `{ moduleId, dependsOnModuleId }` reads "moduleId requires
 * dependsOnModuleId to be completed first". Adding a new edge creates a cycle
 * iff `dependsOnModuleId` can already reach `moduleId` by following existing
 * edges forward (i.e. the prerequisite already depends, directly or
 * transitively, on the module being edited).
 */
export interface DependencyEdge {
  moduleId: string
  dependsOnModuleId: string
}

export function wouldCreateDependencyCycle(
  existingEdges: DependencyEdge[],
  candidate: DependencyEdge
): boolean {
  if (candidate.moduleId === candidate.dependsOnModuleId) {
    return true
  }

  const adjacency = new Map<string, string[]>()
  for (const edge of existingEdges) {
    const list = adjacency.get(edge.moduleId) ?? []
    list.push(edge.dependsOnModuleId)
    adjacency.set(edge.moduleId, list)
  }

  const visited = new Set<string>()
  const stack: string[] = [candidate.dependsOnModuleId]

  while (stack.length > 0) {
    const current = stack.pop() as string
    if (current === candidate.moduleId) {
      return true
    }
    if (visited.has(current)) {
      continue
    }
    visited.add(current)
    for (const next of adjacency.get(current) ?? []) {
      stack.push(next)
    }
  }

  return false
}
