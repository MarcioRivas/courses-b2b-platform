/** "820 KB", "3,4 MB" — for file chips and lists. */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`
  }
  return `${(bytes / (1024 * 1024)).toLocaleString("es-UY", { maximumFractionDigits: 1 })} MB`
}
