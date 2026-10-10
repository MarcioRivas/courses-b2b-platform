import { ViewTransition, type ReactNode } from "react"

/** Transition types set on `<Link transitionTypes>`; styled in `src/app/motion.css`. */
export const NAV_FORWARD = ["nav-forward"]
export const NAV_BACK = ["nav-back"]

/**
 * Page-level directional slide for the student flow. Only typed navigations
 * animate (`default: "none"`), so plain links, browser back/forward and
 * refreshes stay instant. Key it by the route param when the same route swaps
 * content (lesson → lesson) so it remounts and enter/exit fire.
 */
export function DirectionalTransition({ children }: { children: ReactNode }) {
  return (
    <ViewTransition
      enter={{ "nav-forward": "nav-forward", "nav-back": "nav-back", default: "none" }}
      exit={{ "nav-forward": "nav-forward", "nav-back": "nav-back", default: "none" }}
      default="none"
    >
      {children}
    </ViewTransition>
  )
}
