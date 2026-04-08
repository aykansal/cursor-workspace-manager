import fs from 'fs'
import type { TranscriptDetail, TranscriptSummary } from '../contracts'

function extractTextContent(value: unknown): string[] {
  if (!value) return []

  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed ? [trimmed] : []
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry) => extractTextContent(entry))
  }

  if (typeof value !== 'object') return []

  const record = value as Record<string, unknown>

  if (record.type === 'text' && typeof record.text === 'string') {
    return record.text.trim() ? [record.text.trim()] : []
  }

  if ('content' in record) {
    return extractTextContent(record.content)
  }

  if ('text' in record && typeof record.text === 'string') {
    return record.text.trim() ? [record.text.trim()] : []
  }

  return []
}

export function readTranscriptContent(transcriptPath: string): string {
  if (!fs.existsSync(transcriptPath)) return ''

  return fs
    .readFileSync(transcriptPath, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      try {
        const parsed = JSON.parse(line) as Record<string, unknown>
        const role = typeof parsed.role === 'string' && parsed.role.trim() ? parsed.role.trim() : 'assistant'
        const text = extractTextContent(parsed.message)
          .join('\n')
          .replace(/\[REDACTED\]/gi, '')
          .trim()

        if (!text) return []

        const speaker =
          role === 'user'
            ? 'User'
            : role === 'assistant'
              ? 'Assistant'
              : `${role[0]?.toUpperCase() ?? 'A'}${role.slice(1)}`

        return [`${speaker}: ${text}`]
      } catch {
        return []
      }
    })
    .join('\n\n')
}

export function getTranscriptDetail(summary: TranscriptSummary): TranscriptDetail {
  const content = readTranscriptContent(summary.transcriptPath)

  return {
    ...summary,
    content: content || (summary.hasContent ? '' : 'Transcript file not found'),
  }
}
