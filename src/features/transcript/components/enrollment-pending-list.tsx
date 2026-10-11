import { studentTranscriptMessages as t } from "@/lib/messages/student-transcript"
import type { TranscriptPendingItem } from "../types"

function kindLabel(p: TranscriptPendingItem): string {
  return p.kind === "ASSESSMENT" ? t.pending.assessment : (t.pending.blockKind[p.itemKind] ?? p.itemKind)
}

/** "Pendiente": what is left, grouped by module (assessments with no module go under a generic heading). */
export function EnrollmentPendingList({ pending }: { pending: TranscriptPendingItem[] }) {
  const groups = new Map<string, TranscriptPendingItem[]>()
  for (const p of pending) {
    const key = p.moduleTitle ?? t.pending.noModule
    groups.set(key, [...(groups.get(key) ?? []), p])
  }

  return (
    <section className="flex flex-col gap-2">
      <h4 className="text-sm font-semibold">{t.pending.title}</h4>
      {pending.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t.pending.none}</p>
      ) : (
        <ul className="flex flex-col gap-3 text-sm">
          {[...groups.entries()].map(([module, items]) => (
            <li key={module}>
              <p className="font-medium">{module}</p>
              <ul className="mt-1 flex flex-col gap-0.5 text-muted-foreground">
                {items.map((p, i) => (
                  <li key={`${p.itemTitle}-${i}`}>
                    {p.lessonTitle ? `${p.lessonTitle} · ` : ""}
                    {kindLabel(p)}
                    {p.itemTitle ? ` "${p.itemTitle}"` : ""}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
