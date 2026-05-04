import { describe, expect, it } from 'vitest'
import { parseTranscriptMessages } from './transcript-parser'

describe('parseTranscriptMessages', () => {
  it('parses user query, assistant text, tool calls, and redacted reasoning markers', () => {
    const transcript = [
      JSON.stringify({
        role: 'user',
        message: {
          content: [
            {
              type: 'text',
              text: '<timestamp>Friday</timestamp>\n<user_query>\nhello world\n</user_query>',
            },
          ],
        },
      }),
      JSON.stringify({
        role: 'assistant',
        message: {
          content: [
            {
              type: 'text',
              text: 'Checking files now.\\n\\n[REDACTED]',
            },
            {
              type: 'tool_use',
              name: 'ReadFile',
              input: { path: 'app.ts' },
            },
          ],
        },
      }),
    ].join('\n')

    const messages = parseTranscriptMessages(transcript)

    expect(messages).toHaveLength(2)
    expect(messages[0]).toMatchObject({
      role: 'user',
    })
    expect(messages[0].blocks[0]).toMatchObject({
      type: 'text',
      content: 'hello world',
    })

    expect(messages[1].blocks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'text',
          content: 'Checking files now.',
        }),
        expect.objectContaining({
          type: 'redacted',
        }),
        expect.objectContaining({
          type: 'tool',
          name: 'ReadFile',
        }),
      ])
    )
  })

  it('keeps unknown items as fallback blocks instead of dropping them', () => {
    const transcript = JSON.stringify({
      role: 'assistant',
      message: {
        content: [{ type: 'image_url', url: 'https://example.com/demo.png' }],
      },
    })

    const messages = parseTranscriptMessages(transcript)

    expect(messages).toHaveLength(1)
    expect(messages[0].blocks[0]).toMatchObject({
      type: 'unknown',
      label: 'image_url',
    })
  })
})
