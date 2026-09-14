import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-4xl border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground [a]:hover:bg-primary/80",
        secondary:
          "bg-secondary text-secondary-foreground [a]:hover:bg-secondary/80",
        // `text-destructive` on `bg-destructive/10` measures 4:1 — below the
        // 4.5:1 WCAG AA threshold for this chip's text size (a11y review,
        // state chips). `red-700`/`red-400` keep the same hue family at a
        // contrast-safe shade against the light/dark badge backgrounds.
        destructive:
          "bg-destructive/10 text-red-700 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:text-red-400 dark:focus-visible:ring-destructive/40 [a]:hover:bg-destructive/20",
        // Soft semantic tones: 700-shade text on the 50-shade soft bg (light)
        // and 300 on 950/40 (dark) keep every chip above 4.5:1.
        success:
          "bg-success-soft text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
        brand: "bg-brand-soft text-sky-800 dark:bg-sky-950/40 dark:text-sky-300",
        warning:
          "bg-warning-soft text-yellow-900 dark:bg-yellow-950/40 dark:text-yellow-300",
        outline:
          "border-border text-foreground [a]:hover:bg-muted [a]:hover:text-muted-foreground",
        ghost:
          "hover:bg-muted hover:text-muted-foreground dark:hover:bg-muted/50",
        link: "text-primary underline-offset-4 hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant }), className),
      },
      props
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  })
}

export { Badge, badgeVariants }
