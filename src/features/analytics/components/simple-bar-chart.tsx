import { analyticsMessages } from "@/lib/messages/analytics"

/** Bars cycle through the theme chart tokens unless a datum pins its own colour. */
const BAR_CLASSES = ["bg-chart-1", "bg-chart-2", "bg-chart-3", "bg-chart-4", "bg-chart-5"] as const

export interface BarChartDatum {
  label: string
  value: number
  color?: string
}

interface SimpleBarChartProps {
  title: string
  data: BarChartDatum[]
}

/**
 * Horizontal bar chart, pure divs — no chart library (YAGNI, bundle size).
 * The bars themselves are `aria-hidden`: the container carries `role="img"`
 * plus an `aria-label` summary, and a visually-hidden table gives screen
 * reader / assistive tech users the exact values (Success Criteria: zero new
 * chart dependencies, accessible summary).
 */
export function SimpleBarChart({ title, data }: SimpleBarChartProps) {
  const max = Math.max(1, ...data.map((datum) => datum.value))
  const summary = data.map((datum) => `${datum.label}: ${datum.value}`).join(", ")

  return (
    <div className="flex flex-col gap-2">
      <div role="img" aria-label={`${title}. ${summary}`} className="flex flex-col gap-2">
        {data.map((datum, index) => (
          <div key={index} aria-hidden="true" className="flex items-center gap-2 text-sm">
            <span className="w-32 shrink-0 truncate text-muted-foreground">{datum.label}</span>
            <div className="h-4 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full rounded-full ${BAR_CLASSES[index % BAR_CLASSES.length]}`}
                style={{ width: `${(datum.value / max) * 100}%`, backgroundColor: datum.color }}
              />
            </div>
            <span className="w-10 shrink-0 text-right tabular-nums">{datum.value}</span>
          </div>
        ))}
      </div>
      <table className="sr-only">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th scope="col">{analyticsMessages.chart.category}</th>
            <th scope="col">{analyticsMessages.chart.value}</th>
          </tr>
        </thead>
        <tbody>
          {data.map((datum, index) => (
            <tr key={index}>
              <td>{datum.label}</td>
              <td>{datum.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
