import { cn } from "@/lib/utils"

interface SectionHeadingProps {
  id: string
  eyebrow: string
  title: string
  lead?: string
  align?: "left" | "center"
}

/** Eyebrow + h2 + lead. `id` goes on the h2 so sections can use `aria-labelledby`. */
export function SectionHeading({ id, eyebrow, title, lead, align = "center" }: SectionHeadingProps) {
  return (
    <div className={cn("max-w-2xl", align === "center" && "mx-auto text-center")}>
      <p className="text-xs font-semibold tracking-wider text-primary uppercase">{eyebrow}</p>
      <h2 id={id} className="mt-2 text-3xl font-semibold tracking-tight text-balance md:text-4xl">
        {title}
      </h2>
      {lead ? <p className="mt-3 text-base text-muted-foreground md:text-lg">{lead}</p> : null}
    </div>
  )
}
