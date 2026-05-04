export type TranscriptRenderBlock =
  | { type: 'text'; content: string }
  | { type: 'section'; label: string; content: string; attachments: TranscriptAttachment[] }
  | { type: 'attachments'; label: string; items: TranscriptAttachment[] }
  | { type: 'code'; content: string; language: string }
  | { type: 'tool'; name: string; input: string }
  | { type: 'redacted'; label: string }
  | { type: 'unknown'; label: string; content: string }

export type TranscriptAttachment = {
  raw: string
  label: string
}

export type TranscriptRenderMessage = {
  id: string
  role: 'user' | 'assistant'
  blocks: TranscriptRenderBlock[]
  searchText: string
}

type RawContentItem = {
  type?: unknown
  text?: unknown
  name?: unknown
  input?: unknown
}

type RawTranscriptEntry = {
  role?: unknown
  message?: {
    content?: unknown
  }
}

const KNOWN_XML_SECTION_PATTERN =
  /<(?<tag>timestamp|user[_-]?query|userquery|attached_files|image_files|code_selection|terminal_selection|manually_attached_skills)\b[^>]*>(?<content>[\s\S]*?)<\/(?:timestamp|user[_-]?query|userquery|attached_files|image_files|code_selection|terminal_selection|manually_attached_skills)>/gi

const ATTACHMENT_PATTERN = /(^|\s)(@[^\s<>{}[\]()"']+)/g

function normalizeXmlTag(tag: string): string {
  return tag.toLowerCase().replace(/[-_]/g, '')
}

function getSectionLabel(tag: string): string {
  switch (normalizeXmlTag(tag)) {
    case 'userquery':
      return 'User query'
    case 'attachedfiles':
      return 'Attached files'
    case 'imagefiles':
      return 'Image files'
    case 'codeselection':
      return 'Code selection'
    case 'terminalselection':
      return 'Terminal selection'
    case 'manuallyattachedskills':
      return 'Attached skills'
    default:
      return tag
  }
}

function cleanXmlText(content: string): string {
  return content
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>\s*<p[^>]*>/gi, '\n\n')
    .replace(/<\/?p[^>]*>/gi, '')
    .trim()
}

function extractAttachments(content: string): TranscriptAttachment[] {
  const seen = new Set<string>()
  const attachments: TranscriptAttachment[] = []

  for (const match of content.matchAll(ATTACHMENT_PATTERN)) {
    const raw = match[2].replace(/[.,;:]+$/g, '')
    if (seen.has(raw)) continue

    seen.add(raw)
    attachments.push({
      raw,
      label: raw.replace(/^@/, '').split(/[\\/]/).pop() ?? raw,
    })
  }

  return attachments
}

function cleanAssistantText(content: string): { text: string; hadRedacted: boolean } {
  const hadRedacted = /\[REDACTED\]/i.test(content)

  return {
    text: content.replace(/\[REDACTED\]/gi, '').trim(),
    hadRedacted,
  }
}

function stringifyValue(value: unknown): string {
  if (typeof value === 'string') return value

  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function parseCodeAndTextBlocks(content: string): TranscriptRenderBlock[] {
  const parts = content.split(/```/)
  const blocks: TranscriptRenderBlock[] = []

  parts.forEach((part, index) => {
    if (index % 2 === 1) {
      const [languageLine, ...codeLines] = part.split('\n')
      blocks.push({
        type: 'code',
        language: languageLine.trim(),
        content: codeLines.join('\n').trim(),
      })
      return
    }

    const textBlocks = part
      .split(/\n\s*\n/)
      .map((chunk) => chunk.trim())
      .filter(Boolean)
      .map((chunk) => ({ type: 'text' as const, content: chunk }))
    blocks.push(...textBlocks)
  })

  return blocks
}

function parseTextWithAttachments(content: string): TranscriptRenderBlock[] {
  const attachments = extractAttachments(content)
  const blocks = parseCodeAndTextBlocks(content)

  if (attachments.length > 0) {
    blocks.unshift({
      type: 'attachments',
      label: 'Referenced files',
      items: attachments,
    })
  }

  return blocks
}

function parseUserTextBlocks(content: string): TranscriptRenderBlock[] {
  const blocks: TranscriptRenderBlock[] = []
  let cursor = 0

  for (const match of content.matchAll(KNOWN_XML_SECTION_PATTERN)) {
    const matchIndex = match.index ?? 0
    const before = cleanXmlText(content.slice(cursor, matchIndex))

    if (before) {
      blocks.push(...parseTextWithAttachments(before))
    }

    const tag = match.groups?.tag ?? 'section'
    const sectionContent = cleanXmlText(match.groups?.content ?? '')
    if (normalizeXmlTag(tag) !== 'timestamp' && sectionContent) {
      blocks.push({
        type: 'section',
        label: getSectionLabel(tag),
        content: sectionContent,
        attachments: extractAttachments(sectionContent),
      })
    }

    cursor = matchIndex + match[0].length
  }

  const after = cleanXmlText(content.slice(cursor))
  if (after) {
    blocks.push(...parseTextWithAttachments(after))
  }

  return blocks
}

function parseContentItem(role: 'user' | 'assistant', item: RawContentItem): TranscriptRenderBlock[] {
  const itemType = typeof item.type === 'string' ? item.type : 'unknown'

  if (itemType === 'text' && typeof item.text === 'string') {
    if (role === 'user') {
      return parseUserTextBlocks(item.text)
    }

    const normalized = cleanAssistantText(item.text)

    const blocks = normalized.text ? parseCodeAndTextBlocks(normalized.text) : []
    if (normalized.hadRedacted) {
      blocks.push({
        type: 'redacted',
        label: 'Reasoning content redacted by Cursor',
      })
    }

    return blocks
  }

  if (itemType === 'tool_use') {
    return [
      {
        type: 'tool',
        name: typeof item.name === 'string' ? item.name : 'Tool',
        input: stringifyValue(item.input),
      },
    ]
  }

  return [
    {
      type: 'unknown',
      label: itemType,
      content: stringifyValue(item),
    },
  ]
}

function parseMessageContent(role: 'user' | 'assistant', content: unknown): TranscriptRenderBlock[] {
  if (typeof content === 'string') {
    return role === 'user' ? parseUserTextBlocks(content) : parseCodeAndTextBlocks(cleanAssistantText(content).text)
  }

  if (!Array.isArray(content)) {
    return [
      {
        type: 'unknown',
        label: 'message',
        content: stringifyValue(content),
      },
    ]
  }

  return content.flatMap((item) => {
    if (!item || typeof item !== 'object') {
      return [
        {
          type: 'unknown' as const,
          label: 'content',
          content: stringifyValue(item),
        },
      ]
    }

    return parseContentItem(role, item as RawContentItem)
  })
}

function buildSearchText(blocks: TranscriptRenderBlock[]): string {
  return blocks
    .map((block) => {
      switch (block.type) {
        case 'text':
        case 'code':
          return block.content
        case 'tool':
          return `${block.name}\n${block.input}`
        case 'redacted':
          return block.label
        case 'unknown':
          return `${block.label}\n${block.content}`
      }
    })
    .join('\n')
    .toLowerCase()
}

export function parseTranscriptMessages(content: string): TranscriptRenderMessage[] {
  return content
    .split(/\r?\n/)
    .map((line, index) => ({ line: line.trim(), index }))
    .filter(({ line }) => Boolean(line))
    .flatMap(({ line, index }) => {
      try {
        const entry = JSON.parse(line) as RawTranscriptEntry
        const role = entry.role === 'user' ? 'user' : 'assistant'
        const blocks = parseMessageContent(role, entry.message?.content).filter((block) => {
          if (block.type === 'text') return Boolean(block.content.trim())
          if (block.type === 'code') return Boolean(block.content.trim())
          return true
        })

        if (blocks.length === 0) return []

        return [
          {
            id: `${role}-${index}`,
            role,
            blocks,
            searchText: buildSearchText(blocks),
          },
        ]
      } catch {
        return [
          {
            id: `assistant-${index}`,
            role: 'assistant' as const,
            blocks: [
              {
                type: 'unknown',
                label: 'raw',
                content: line,
              },
            ],
            searchText: line.toLowerCase(),
          },
        ]
      }
    })
}
