import { describe, expect, it } from "vitest"
import type { AppNotification, NotificationType } from "../types"
import { formatNotificationDate, presentNotification } from "./notification-presentation"

const TZ = "America/Montevideo"
const ENROLL = "11111111-2222-3333-4444-555555555555"
const ASSESS = "66666666-7777-8888-9999-aaaaaaaaaaaa"
const ATTEMPT = "bbbbbbbb-cccc-dddd-eeee-ffffffffffff"
const OFFERING = "12345678-1234-1234-1234-123456789012"

function notif(type: NotificationType | string, payload: Record<string, unknown>): AppNotification {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    type: type as NotificationType,
    entityId: "00000000-0000-0000-0000-000000000002",
    offeringId: OFFERING,
    payload,
    readAt: null,
    updatedAt: "2026-10-15T12:00:00Z",
  }
}

const view = (type: NotificationType | string, payload: Record<string, unknown>) =>
  presentNotification(notif(type, payload), TZ)

describe("presentNotification: one case per type", () => {
  it("MODULE_OPENED links to the course and names module and course", () => {
    const v = view("MODULE_OPENED", { moduleTitle: "Módulo 1", courseTitle: "Contabilidad", enrollmentId: ENROLL })
    expect(v.title).toBe("Nuevo módulo disponible")
    expect(v.body).toBe('"Módulo 1" ya está disponible en Contabilidad.')
    expect(v.href).toBe(`/learn/courses/${ENROLL}`)
  })

  it("MODULE_CLOSING_SOON formats the closing date in the org timezone", () => {
    // 21:00 UTC is 18:00 in Montevideo (UTC-3, no DST).
    const v = view("MODULE_CLOSING_SOON", {
      moduleTitle: "Módulo 2",
      availableUntil: "2026-10-16T21:00:00Z",
      enrollmentId: ENROLL,
    })
    expect(v.title).toBe("Un módulo cierra pronto")
    expect(v.body).toContain('"Módulo 2" cierra el 16/10')
    expect(v.body).toContain("18:00")
    expect(v.href).toBe(`/learn/courses/${ENROLL}`)
  })

  it("ASSESSMENT_GRADED of a quiz links to its attempt result", () => {
    const v = view("ASSESSMENT_GRADED", { kind: "QUIZ", assessmentTitle: "Parcial", attemptId: ATTEMPT, assessmentId: ASSESS, enrollmentId: ENROLL })
    expect(v.title).toBe("Tenés una corrección nueva")
    expect(v.body).toBe('Ya podés ver la corrección de el cuestionario "Parcial".')
    expect(v.href).toBe(`/learn/attempts/${ATTEMPT}`)
  })

  it("ASSESSMENT_GRADED of a task links to the task screen, not the attempt route", () => {
    const v = view("ASSESSMENT_GRADED", { kind: "TASK", assessmentTitle: "Ensayo", attemptId: ATTEMPT, assessmentId: ASSESS, enrollmentId: ENROLL })
    expect(v.body).toBe('Ya podés ver la corrección de la tarea "Ensayo".')
    expect(v.href).toBe(`/learn/assessments/${ASSESS}/start?enrollment=${ENROLL}`)
  })

  it("ASSESSMENT_DUE_SOON links to the start screen and shows the due date", () => {
    const v = view("ASSESSMENT_DUE_SOON", {
      assessmentTitle: "Tarea 3",
      dueAt: "2026-10-16T21:00:00Z",
      assessmentId: ASSESS,
      enrollmentId: ENROLL,
    })
    expect(v.title).toBe("Entrega próxima")
    expect(v.body).toContain('"Tarea 3" vence el 16/10')
    expect(v.href).toBe(`/learn/assessments/${ASSESS}/start?enrollment=${ENROLL}`)
  })

  it("EXAM_TODAY shows the start time in the org timezone", () => {
    // 13:30 UTC is 10:30 in Montevideo.
    const v = view("EXAM_TODAY", {
      assessmentTitle: "Final",
      startsAt: "2026-10-15T13:30:00Z",
      assessmentId: ASSESS,
      enrollmentId: ENROLL,
    })
    expect(v.title).toBe("Hoy tenés examen")
    expect(v.body).toBe('"Final" empieza hoy a las 10:30.')
    expect(v.href).toBe(`/learn/assessments/${ASSESS}/start?enrollment=${ENROLL}`)
  })

  it("TASK_READY_TO_GRADE links to the grading queue filtered by offering and assessment", () => {
    const v = view("TASK_READY_TO_GRADE", { assessmentTitle: "Ensayo", count: 3, offeringId: OFFERING, assessmentId: ASSESS })
    expect(v.title).toBe("Tarea lista para corregir")
    expect(v.body).toBe('"Ensayo" cerró con 3 entregas para corregir.')
    expect(v.href).toBe(`/teach/grading?offeringId=${OFFERING}&assessmentId=${ASSESS}`)
  })

  it("LATE_SUBMISSIONS uses singular and plural copy and links to grading", () => {
    const one = view("LATE_SUBMISSIONS", { assessmentTitle: "Tarea", count: 1, offeringId: OFFERING, assessmentId: ASSESS })
    expect(one.title).toBe("Entregas fuera de plazo")
    expect(one.body).toBe('1 entrega fuera de plazo en "Tarea".')
    expect(one.href).toBe(`/teach/grading?offeringId=${OFFERING}&assessmentId=${ASSESS}`)

    const many = view("LATE_SUBMISSIONS", { assessmentTitle: "Tarea", count: 2, offeringId: OFFERING, assessmentId: ASSESS })
    expect(many.body).toBe('2 entregas fuera de plazo en "Tarea".')
  })

  it("ATTEMPT_NEEDS_GRADING uses singular and plural copy and links to grading", () => {
    const one = view("ATTEMPT_NEEDS_GRADING", { assessmentTitle: "Parcial", count: 1, offeringId: OFFERING, assessmentId: ASSESS })
    expect(one.title).toBe("Respuestas para corregir")
    expect(one.body).toBe('1 intento de "Parcial" espera corrección.')
    expect(one.href).toBe(`/teach/grading?offeringId=${OFFERING}&assessmentId=${ASSESS}`)

    const many = view("ATTEMPT_NEEDS_GRADING", { assessmentTitle: "Parcial", count: 4, offeringId: OFFERING, assessmentId: ASSESS })
    expect(many.body).toBe('4 intentos de "Parcial" esperan corrección.')
  })
})

describe("presentNotification: missing or invalid payload", () => {
  it("falls back to the course home when the enrollment id is missing or not a uuid", () => {
    expect(view("MODULE_OPENED", { moduleTitle: "M", courseTitle: "C" }).href).toBe("/learn")
    expect(view("MODULE_OPENED", { moduleTitle: "M", enrollmentId: "not-a-uuid" }).href).toBe("/learn")
  })

  it("falls back to /learn for assessment links when either id is invalid", () => {
    expect(view("ASSESSMENT_DUE_SOON", { assessmentId: ASSESS }).href).toBe("/learn")
    expect(view("EXAM_TODAY", { assessmentId: "bad", enrollmentId: ENROLL }).href).toBe("/learn")
  })

  it("a graded quiz without a usable attempt id falls back to the assessment start link", () => {
    const v = view("ASSESSMENT_GRADED", { kind: "QUIZ", attemptId: "nope", assessmentId: ASSESS, enrollmentId: ENROLL })
    expect(v.href).toBe(`/learn/assessments/${ASSESS}/start?enrollment=${ENROLL}`)
    expect(view("ASSESSMENT_GRADED", { kind: "QUIZ" }).href).toBe("/learn")
  })

  it("grading links keep only the valid ids, or go to the bare queue when none is valid", () => {
    expect(view("LATE_SUBMISSIONS", { offeringId: OFFERING, assessmentId: "x", count: 1 }).href).toBe(
      `/teach/grading?offeringId=${OFFERING}`
    )
    expect(view("TASK_READY_TO_GRADE", { offeringId: "", assessmentId: "" }).href).toBe("/teach/grading")
  })

  it("a missing, zero or negative count reads as one entry", () => {
    expect(view("TASK_READY_TO_GRADE", { assessmentTitle: "T" }).body).toBe('"T" cerró con 1 entrega para corregir.')
    expect(view("TASK_READY_TO_GRADE", { assessmentTitle: "T", count: 0 }).body).toBe('"T" cerró con 1 entrega para corregir.')
    expect(view("ATTEMPT_NEEDS_GRADING", { assessmentTitle: "T", count: -2 }).body).toBe('1 intento de "T" espera corrección.')
  })

  it("an invalid date renders an empty date without throwing", () => {
    const v = view("MODULE_CLOSING_SOON", { moduleTitle: "Módulo 9", availableUntil: "not-a-date" })
    expect(v.body).toContain('"Módulo 9"')
    expect(formatNotificationDate("not-a-date", TZ)).toBe("")
    expect(formatNotificationDate("", TZ)).toBe("")
  })
})

describe("presentNotification: unknown input", () => {
  it("an unknown type gets the generic copy and the home link", () => {
    expect(view("SOMETHING_NEW", { anything: 1 })).toEqual({
      title: "Notificación",
      body: "Tenés una novedad.",
      href: "/",
    })
  })

  it("an empty payload still renders a view for a known type", () => {
    const v = view("LATE_SUBMISSIONS", {})
    expect(v.title).toBe("Entregas fuera de plazo")
    expect(v.href).toBe("/teach/grading")
  })
})
