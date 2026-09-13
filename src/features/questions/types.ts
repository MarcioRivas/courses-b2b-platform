import type { Database } from "@/types/database.types"

export type QuestionType = Database["public"]["Enums"]["question_type"]

export interface BankListItem {
  id: string
  name: string
  description: string | null
  courseId: string | null
  courseTitle: string | null
  questionCount: number
}

export interface BankDetail {
  id: string
  organizationId: string
  courseId: string | null
  courseTitle: string | null
  name: string
  description: string | null
}

export interface QuestionOptionItem {
  id: string
  label: string
  position: number
  isCorrect: boolean
}

export interface QuestionListItem {
  id: string
  type: QuestionType
  prompt: string
  defaultPoints: number
  isActive: boolean
  optionCount: number
}

export interface QuestionDetail {
  id: string
  questionBankId: string
  organizationId: string
  type: QuestionType
  prompt: string
  defaultPoints: number
  isActive: boolean
  options: QuestionOptionItem[]
}

/** Selectable in a course's assessment picker: bank name + course scope. */
export interface QuestionOptionForPicker {
  id: string
  bankId: string
  bankName: string
  prompt: string
  defaultPoints: number
}

export interface CourseOption {
  id: string
  title: string
}
