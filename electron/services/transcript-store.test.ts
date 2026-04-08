import fs from 'fs'
import os from 'os'
import path from 'path'
import { describe, expect, it } from 'vitest'
import { getTranscriptDetail, readTranscriptContent } from './transcript-store'

describe('transcript-store', () => {
  it('reads and parses a valid JSONL transcript while stripping redactions', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'transcript-store-'))
    const transcriptPath = path.join(tempDir, 'chat.jsonl')
    fs.writeFileSync(
      transcriptPath,
      [
        JSON.stringify({ role: 'user', message: { text: 'Hello [REDACTED]' } }),
        '{invalid',
        JSON.stringify({ role: 'assistant', message: { content: [{ type: 'text', text: 'Hi there' }] } }),
      ].join('\n'),
      'utf8'
    )

    expect(readTranscriptContent(transcriptPath)).toBe('User: Hello\n\nAssistant: Hi there')
  })

  it('returns fallback detail when the transcript file is missing', () => {
    const detail = getTranscriptDetail({
      id: 'composer:1',
      sourceKey: '1',
      title: 'Missing',
      summary: null,
      updatedAt: null,
      transcriptPath: 'Z:\\missing.jsonl',
      hasContent: false,
    })

    expect(detail.content).toBe('Transcript file not found')
  })
})
