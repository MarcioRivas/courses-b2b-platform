"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { taskSubmissionMessages } from "@/lib/messages/task-submissions"
import { TASK_SUBMISSIONS_BUCKET } from "@/lib/storage/task-submission-file-path"
import { prepareTaskUpload } from "../actions/prepare-task-upload"
import { submitTask } from "../actions/submit-task"
import { discardTaskUploads } from "../actions/discard-task-uploads"

interface UploadProgress {
  done: number
  total: number
}

/**
 * Orchestrates one submission: prepare (server gate + signed upload URLs) →
 * upload each file straight to storage → `submitTask`. If anything fails
 * after a file landed in the bucket, the uploaded paths are discarded so no
 * orphan is left behind. Returns an error message, or null on success.
 */
export function useTaskUpload(params: { assessmentId: string; enrollmentId: string }) {
  const router = useRouter()
  const [progress, setProgress] = useState<UploadProgress | null>(null)

  async function upload(files: File[]): Promise<string | null> {
    const { assessmentId, enrollmentId } = params
    setProgress({ done: 0, total: files.length })

    const uploaded: string[] = []
    const cleanUp = async () => {
      if (uploaded.length > 0) {
        await discardTaskUploads({ assessmentId, enrollmentId, paths: uploaded })
      }
    }

    try {
      const prepared = await prepareTaskUpload({
        assessmentId,
        enrollmentId,
        files: files.map((file) => ({ name: file.name, size: file.size, type: file.type })),
      })
      if (!prepared.ok) {
        return prepared.message
      }

      const storage = createClient().storage.from(TASK_SUBMISSIONS_BUCKET)

      for (const [index, target] of prepared.data.uploads.entries()) {
        const { error } = await storage.uploadToSignedUrl(target.path, target.token, files[index]!, {
          contentType: target.contentType,
        })
        if (error) {
          await cleanUp()
          return taskSubmissionMessages.errors.UPLOAD_FAILED
        }
        uploaded.push(target.path)
        setProgress({ done: index + 1, total: files.length })
      }

      const submitted = await submitTask({
        assessmentId,
        enrollmentId,
        files: prepared.data.uploads.map((target) => ({ path: target.path, filename: target.filename })),
      })
      if (!submitted.ok) {
        await cleanUp()
        return submitted.message
      }

      router.refresh()
      return null
    } catch {
      await cleanUp()
      return taskSubmissionMessages.errors.UPLOAD_FAILED
    } finally {
      setProgress(null)
    }
  }

  return { upload, progress, uploading: progress !== null }
}
