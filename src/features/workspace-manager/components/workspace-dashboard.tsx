import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react'
import type {
  TranscriptDetail,
  TranscriptSummary,
  WorkspaceScanState,
  WorkspaceSummary,
} from '../../../../electron/preload'
import { Button } from '@/components/ui/button'
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
  ComboboxValue,
} from '@/components/ui/combobox'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { SidebarInset, SidebarTrigger } from '@/components/ui/sidebar'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import {
  BotIcon,
  CheckIcon,
  DownloadIcon,
  EyeOffIcon,
  FolderSearch2Icon,
  MoveRightIcon,
  RefreshCwIcon,
  SearchIcon,
  UserIcon,
  WrenchIcon,
} from 'lucide-react'
import {
  parseTranscriptMessages,
  type TranscriptAttachment,
  type TranscriptRenderBlock,
} from '../lib/transcript-parser'
import { TransferStatusAlert } from './transfer-status-alert'
import { getProjectName } from '../lib/workspace-utils'

type WorkspaceDashboardProps = {
  activeWorkspace: WorkspaceSummary | undefined
  sourceHash: string | null
  sourceComposerId: string | null
  sourceComposerTitle: string | null
  sourceWorkspace: WorkspaceSummary | undefined
  workspaces: WorkspaceSummary[]
  status: string
  scanState: WorkspaceScanState
  transcriptError: string | null
  transcriptDetailLoading: boolean
  transcriptListLoading: boolean
  transcriptCount: number
  selectedTranscript: TranscriptDetail | null
  selectedTranscriptSummary: TranscriptSummary | null
  onRefreshTranscripts: () => Promise<void> | void
  onSelectSource: (hash: string, transcript: TranscriptSummary | null) => void
  onTransfer: (targetHash: string) => void
}

function renderInlineText(content: string): ReactNode[] {
  const pattern = /(\[[^\]]+\]\([^\)]+\)|`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g
  const nodes: ReactNode[] = []
  let lastIndex = 0

  for (const match of content.matchAll(pattern)) {
    const matchIndex = match.index ?? 0

    if (matchIndex > lastIndex) {
      nodes.push(content.slice(lastIndex, matchIndex))
    }

    const token = match[0]

    if (token.startsWith('`')) {
      nodes.push(
        <code
          key={`inline-code-${nodes.length}`}
          className="rounded bg-white/8 px-1.5 py-0.5 font-mono text-[0.92em] text-foreground"
        >
          {token.slice(1, -1)}
        </code>
      )
    } else if (token.startsWith('**')) {
      nodes.push(
        <strong key={`inline-strong-${nodes.length}`} className="font-semibold text-foreground">
          {token.slice(2, -2)}
        </strong>
      )
    } else if (token.startsWith('*')) {
      nodes.push(
        <em key={`inline-em-${nodes.length}`} className="italic text-foreground">
          {token.slice(1, -1)}
        </em>
      )
    } else {
      const linkMatch = token.match(/^\[([^\]]+)\]\(([^\)]+)\)$/)
      if (linkMatch) {
        nodes.push(
          <a
            key={`inline-link-${nodes.length}`}
            href={linkMatch[2]}
            target="_blank"
            rel="noreferrer"
            className="text-cyan-200 underline decoration-cyan-200/40 underline-offset-4 transition hover:text-cyan-100"
          >
            {linkMatch[1]}
          </a>
        )
      } else {
        nodes.push(token)
      }
    }

    lastIndex = matchIndex + token.length
  }

  if (lastIndex < content.length) {
    nodes.push(content.slice(lastIndex))
  }

  return nodes
}

function renderTextBlock(content: string, keyPrefix: string): ReactNode {
  const lines = content.split('\n')
  const nodes: ReactNode[] = []

  let lineIndex = 0
  while (lineIndex < lines.length) {
    const line = lines[lineIndex].trimEnd()

    if (!line.trim()) {
      lineIndex += 1
      continue
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/)
    if (headingMatch) {
      const level = headingMatch[1].length
      const headingClassName = cn(
        'font-semibold text-foreground',
        level <= 2 ? 'text-lg' : level === 3 ? 'text-base' : 'text-sm'
      )

      nodes.push(
        <div
          key={`${keyPrefix}-heading-${lineIndex}`}
          className={headingClassName}
        >
          {renderInlineText(headingMatch[2])}
        </div>
      )
      lineIndex += 1
      continue
    }

    if (/^>\s?/.test(line)) {
      const quoteLines: string[] = []
      while (lineIndex < lines.length && /^>\s?/.test(lines[lineIndex].trimStart())) {
        quoteLines.push(lines[lineIndex].trimStart().replace(/^>\s?/, ''))
        lineIndex += 1
      }

      nodes.push(
        <blockquote
          key={`${keyPrefix}-quote-${lineIndex}`}
          className="border-l-2 border-white/12 pl-4 text-[14px] leading-7 text-muted-foreground"
        >
          {quoteLines.map((quoteLine, quoteIndex) => (
            <p key={`${keyPrefix}-quote-${lineIndex}-${quoteIndex}`}>{renderInlineText(quoteLine)}</p>
          ))}
        </blockquote>
      )
      continue
    }

    const unorderedMatch = line.match(/^[-*+]\s+(.*)$/)
    const orderedMatch = line.match(/^\d+\.\s+(.*)$/)
    if (unorderedMatch || orderedMatch) {
      const listItems: string[] = []
      const ordered = Boolean(orderedMatch)

      while (lineIndex < lines.length) {
        const listLine = lines[lineIndex].trimEnd()
        const itemMatch = ordered
          ? listLine.match(/^\d+\.\s+(.*)$/)
          : listLine.match(/^[-*+]\s+(.*)$/)

        if (!itemMatch) break

        listItems.push(itemMatch[1])
        lineIndex += 1
      }

      const ListTag = ordered ? 'ol' : 'ul'

      nodes.push(
        <ListTag
          key={`${keyPrefix}-list-${lineIndex}`}
          className={cn('space-y-1.5 pl-5', ordered ? 'list-decimal' : 'list-disc')}
        >
          {listItems.map((item, itemIndex) => (
            <li key={`${keyPrefix}-list-${lineIndex}-${itemIndex}`} className="pl-1 text-[14px] leading-7 text-foreground/90">
              {renderInlineText(item)}
            </li>
          ))}
        </ListTag>
      )
      continue
    }

    const paragraphLines = [line.trim()]
    lineIndex += 1

    while (lineIndex < lines.length) {
      const nextLine = lines[lineIndex].trimEnd()
      const nextTrimmed = nextLine.trim()

      if (!nextTrimmed) {
        lineIndex += 1
        break
      }

      if (
        nextLine.startsWith('#') ||
        nextLine.startsWith('>') ||
        /^[-*+]\s+/.test(nextLine) ||
        /^\d+\.\s+/.test(nextLine)
      ) {
        break
      }

      paragraphLines.push(nextTrimmed)
      lineIndex += 1
    }

    nodes.push(
      <p key={`${keyPrefix}-paragraph-${lineIndex}`} className="text-[14px] leading-7 text-foreground/90">
        {renderInlineText(paragraphLines.join(' '))}
      </p>
    )
  }

  return <div className="space-y-3">{nodes}</div>
}

function renderAttachmentList(items: TranscriptAttachment[], keyPrefix: string): ReactNode {
  if (items.length === 0) return null

  return (
    <ul className="mt-3 space-y-1.5 border-t border-white/8 pt-3">
      {items.map((item, i) => (
        <li key={`${keyPrefix}-att-${i}`} className="font-mono text-[12.5px] leading-6 text-foreground/80">
          {item.label}
        </li>
      ))}
    </ul>
  )
}

function renderTranscriptBlock(block: TranscriptRenderBlock, key: string): ReactNode {
  if (block.type === 'code') {
    return (
      <div key={key} className="overflow-hidden rounded-xl border border-white/10 bg-[#111111]">
        <div className="border-b border-white/8 px-4 py-2 text-xs uppercase tracking-[0.14em] text-muted-foreground">
          {block.language || 'code'}
        </div>
        <pre className="workspace-scroll overflow-auto px-4 py-4 font-mono text-[13px] leading-7 whitespace-pre-wrap text-foreground">
          {block.content}
        </pre>
      </div>
    )
  }

  if (block.type === 'tool') {
    return (
      <div key={key} className="overflow-hidden rounded-xl border border-cyan-500/20 bg-cyan-500/6">
        <div className="flex items-center gap-2 border-b border-cyan-500/12 px-4 py-2.5">
          <Badge variant="outline" className="border-cyan-400/25 bg-cyan-400/8 text-cyan-100">
            <WrenchIcon data-icon="inline-start" />
            Tool Call
          </Badge>
          <div className="text-sm font-medium text-cyan-50">{block.name}</div>
        </div>
        <pre className="workspace-scroll overflow-auto px-4 py-4 font-mono text-[12.5px] leading-6 whitespace-pre-wrap text-cyan-50/92">
          {block.input}
        </pre>
      </div>
    )
  }

  if (block.type === 'redacted') {
    return (
      <div key={key} className="rounded-xl border border-amber-400/15 bg-amber-400/8 px-4 py-3 text-sm text-amber-100">
        <div className="flex items-center gap-2 font-medium">
          <EyeOffIcon className="size-4" />
          {block.label}
        </div>
      </div>
    )
  }

  if (block.type === 'unknown') {
    return (
      <div key={key} className="overflow-hidden rounded-xl border border-white/10 bg-white/4">
        <div className="border-b border-white/8 px-4 py-2 text-xs uppercase tracking-[0.14em] text-muted-foreground">
          {block.label}
        </div>
        <pre className="workspace-scroll overflow-auto px-4 py-4 font-mono text-[12.5px] leading-6 whitespace-pre-wrap text-foreground/85">
          {block.content}
        </pre>
      </div>
    )
  }

  if (block.type === 'attachments') {
    return (
      <div key={key} className="overflow-hidden rounded-xl border border-white/10 bg-white/4">
        <div className="border-b border-white/8 px-4 py-2 text-xs uppercase tracking-[0.14em] text-muted-foreground">
          {block.label}
        </div>
        <div className="px-4 py-4">{renderAttachmentList(block.items, key)}</div>
      </div>
    )
  }

  if (block.type === 'section') {
    return (
      <div key={key} className="overflow-hidden rounded-xl border border-white/10 bg-white/4">
        <div className="border-b border-white/8 px-4 py-2 text-xs uppercase tracking-[0.14em] text-muted-foreground">
          {block.label}
        </div>
        <div className="px-4 py-4">
          {renderTextBlock(block.content, `${key}-section`)}
          {renderAttachmentList(block.attachments, `${key}-section`)}
        </div>
      </div>
    )
  }

  if (block.type === 'text') {
    return (
      <Fragment key={key}>
        {renderTextBlock(block.content, key)}
      </Fragment>
    )
  }

  const _exhaustive: never = block
  return _exhaustive
}

function formatTime(value: string | null) {
  if (!value) return ''

  return new Date(value).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function WorkspaceDashboard({
  activeWorkspace,
  sourceHash,
  sourceComposerId,
  sourceComposerTitle,
  sourceWorkspace,
  workspaces,
  status,
  scanState,
  transcriptError,
  transcriptDetailLoading,
  transcriptListLoading,
  transcriptCount,
  selectedTranscript,
  selectedTranscriptSummary,
  onRefreshTranscripts,
  onSelectSource,
  onTransfer,
}: WorkspaceDashboardProps) {
  const [transcriptSearch, setTranscriptSearch] = useState('')
  const [targetWorkspaceHash, setTargetWorkspaceHash] = useState('')

  const activeProjectName = activeWorkspace ? getProjectName(activeWorkspace.projectPath) : 'Workspace'
  const sourceProjectName = sourceWorkspace ? getProjectName(sourceWorkspace.projectPath) : null
  const isActiveSource =
    Boolean(activeWorkspace && sourceHash === activeWorkspace.hash) &&
    (selectedTranscript?.sourceKey ?? selectedTranscriptSummary?.sourceKey) === sourceComposerId
  const hasSourceChat = Boolean(sourceHash && sourceComposerId)
  const selectedTranscriptUpdatedAt = selectedTranscript?.updatedAt ?? selectedTranscriptSummary?.updatedAt ?? null

  const messages = useMemo(() => {
    if (!selectedTranscript) return []

    const parsed = parseTranscriptMessages(selectedTranscript.content)
    const query = transcriptSearch.trim().toLowerCase()

    if (!query) return parsed

    return parsed.filter((message) => message.searchText.includes(query))
  }, [selectedTranscript, transcriptSearch])

  const transcriptStats = useMemo(() => {
    return messages.reduce(
      (stats, message) => {
        if (message.role === 'user') stats.user += 1
        else stats.assistant += 1

        for (const block of message.blocks) {
          if (block.type === 'tool') stats.tools += 1
          if (block.type === 'redacted') stats.redacted += 1
        }

        return stats
      },
      { user: 0, assistant: 0, tools: 0, redacted: 0 }
    )
  }, [messages])

  const targetWorkspaceOptions = useMemo(
    () =>
      workspaces
        .filter((workspace) => workspace.hash !== sourceHash)
        .map((workspace) => ({
          value: workspace.hash,
          label: getProjectName(workspace.projectPath),
          description: workspace.projectPath,
        })),
    [sourceHash, workspaces]
  )

  useEffect(() => {
    if (!hasSourceChat && targetWorkspaceHash) {
      setTargetWorkspaceHash('')
      return
    }

    if (hasSourceChat && sourceHash === targetWorkspaceHash) {
      setTargetWorkspaceHash('')
    }
  }, [hasSourceChat, sourceHash, targetWorkspaceHash])

  const selectedTargetWorkspace = useMemo(
    () => targetWorkspaceOptions.find((workspace) => workspace.value === targetWorkspaceHash) ?? null,
    [targetWorkspaceHash, targetWorkspaceOptions]
  )

  return (
    <SidebarInset className="min-h-0 overflow-hidden border border-border/60 bg-[linear-gradient(180deg,hsl(0_0%_9%),hsl(0_0%_7%))]">
      <div className="flex items-center gap-2 border-b border-white/8 px-4 py-3 md:px-5">
        <SidebarTrigger className="md:hidden" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-foreground">
            {activeWorkspace ? activeProjectName : 'Select a workspace'}
          </div>
          <div className="truncate text-xs text-muted-foreground">
            {activeWorkspace?.projectPath ?? 'Choose a project from the sidebar'}
          </div>
        </div>
        <div className="hidden items-center gap-2 md:flex">
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={transcriptSearch}
              onChange={(event) => setTranscriptSearch(event.target.value)}
              placeholder="Search transcript"
              className="h-9 w-64 rounded-full border-white/10 bg-white/4 pl-9"
            />
          </div>
          <Button variant="ghost" size="icon-sm" onClick={onRefreshTranscripts} disabled={!activeWorkspace}>
            <RefreshCwIcon className={cn(scanState.status === 'scanning' && 'animate-spin')} />
          </Button>
          <Button variant="ghost" size="icon-sm" disabled>
            <DownloadIcon />
          </Button>
        </div>
      </div>

      {status ? (
        <div className="border-b border-white/8 px-4 py-3 md:px-5">
          <TransferStatusAlert status={status} />
        </div>
      ) : null}

      {scanState.status === 'error' && scanState.message ? (
        <div className="border-b border-white/8 px-4 py-3 text-sm text-amber-100 md:px-5">
          Background indexing issue: {scanState.message}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 px-4 py-3 md:px-5">
        <div className="min-w-0">
          <div className="truncate text-sm text-foreground">
            {selectedTranscript?.title ?? selectedTranscriptSummary?.title ?? 'No chat selected'}
          </div>
          <div className="truncate text-xs text-muted-foreground">
            {selectedTranscriptUpdatedAt
              ? `${formatTime(selectedTranscriptUpdatedAt)} · ${transcriptCount} chats`
              : activeWorkspace
                ? `${transcriptCount} chats`
                : 'Open a workspace to inspect its chats'}
          </div>
          {selectedTranscript ? (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <Badge variant="outline" className="border-white/10 bg-white/4 text-foreground/80">
                {transcriptStats.user} user
              </Badge>
              <Badge variant="outline" className="border-white/10 bg-white/4 text-foreground/80">
                {transcriptStats.assistant} assistant
              </Badge>
              <Badge variant="outline" className="border-cyan-500/20 bg-cyan-500/8 text-cyan-100">
                {transcriptStats.tools} tool calls
              </Badge>
              {transcriptStats.redacted > 0 ? (
                <Badge variant="outline" className="border-amber-400/20 bg-amber-400/8 text-amber-100">
                  {transcriptStats.redacted} redacted
                </Badge>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={isActiveSource ? 'secondary' : 'outline'}
            size="sm"
            disabled={!activeWorkspace || !selectedTranscriptSummary}
            onClick={() => activeWorkspace && onSelectSource(activeWorkspace.hash, selectedTranscriptSummary)}
          >
            {isActiveSource ? 'Source selected' : 'Use this chat as source'}
          </Button>
          {hasSourceChat ? (
            <Combobox
              value={targetWorkspaceHash}
              onValueChange={(value) => {
                setTargetWorkspaceHash(value ?? '')
              }}
            >
              <ComboboxTrigger
                render={
                  <Button
                    variant="outline"
                    className="min-w-60 justify-between"
                  />
                }
              >
                <FolderSearch2Icon data-icon="inline-start" />
                <ComboboxValue placeholder="Choose transfer folder">
                  {selectedTargetWorkspace?.label ?? 'Choose transfer folder'}
                </ComboboxValue>
              </ComboboxTrigger>
              <ComboboxContent>
                <ComboboxEmpty>No matching folders.</ComboboxEmpty>
                <ComboboxList>
                  {targetWorkspaceOptions.map((workspace) => (
                    <ComboboxItem key={workspace.value} value={workspace.value}>
                      <FolderSearch2Icon />
                      <div className="min-w-0">
                        <div className="truncate">{workspace.label}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {workspace.description}
                        </div>
                      </div>
                      {workspace.value === targetWorkspaceHash ? <CheckIcon className="ml-auto" /> : null}
                    </ComboboxItem>
                  ))}
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
          ) : null}
          <Button
            size="sm"
            disabled={!hasSourceChat || !targetWorkspaceHash}
            onClick={() => onTransfer(targetWorkspaceHash)}
          >
            <MoveRightIcon data-icon="inline-start" />
            {sourceProjectName
              ? `Transfer ${sourceComposerTitle ?? 'chat'} from ${sourceProjectName}`
              : 'Transfer here'}
          </Button>
        </div>
      </div>

      <div className="workspace-scroll min-h-0 flex-1 overflow-auto px-4 py-5 md:px-5 md:py-6">
        {!activeWorkspace ? (
          <div className="flex h-full items-center justify-center">
            <div className="max-w-sm text-center">
              <div className="text-base font-medium text-foreground">Pick a workspace</div>
              <div className="mt-2 text-sm leading-6 text-muted-foreground">
                Browse projects from the explorer and open a chat to inspect it here.
              </div>
            </div>
          </div>
        ) : null}

        {activeWorkspace && transcriptListLoading ? (
          <div className="mx-auto flex max-w-4xl flex-col gap-5">
            <Skeleton className="h-20 rounded-2xl bg-white/6" />
            <Skeleton className="h-28 rounded-2xl bg-white/6" />
            <Skeleton className="h-24 rounded-2xl bg-white/6" />
          </div>
        ) : null}

        {!transcriptListLoading && !transcriptDetailLoading && transcriptError ? (
          <div className="mx-auto max-w-3xl rounded-2xl border border-white/10 bg-white/4 px-4 py-3 text-sm text-red-200">
            Unable to read transcript: {transcriptError}
          </div>
        ) : null}

        {!transcriptListLoading && !transcriptError && !selectedTranscriptSummary && activeWorkspace ? (
          <div className="flex h-full items-center justify-center">
            <div className="max-w-sm text-center">
              <div className="text-base font-medium text-foreground">No chat selected</div>
              <div className="mt-2 text-sm leading-6 text-muted-foreground">
                Choose a chat from the workspace tree to open it in this panel.
              </div>
            </div>
          </div>
        ) : null}

        {!transcriptListLoading && !transcriptError && selectedTranscriptSummary && transcriptDetailLoading ? (
          <div className="mx-auto flex max-w-4xl flex-col gap-5">
            <Skeleton className="h-20 rounded-2xl bg-white/6" />
            <Skeleton className="h-28 rounded-2xl bg-white/6" />
            <Skeleton className="h-24 rounded-2xl bg-white/6" />
          </div>
        ) : null}

        {!transcriptListLoading && !transcriptError && selectedTranscript ? (
          <div className="mx-auto max-w-4xl">
            {messages.length === 0 && transcriptSearch ? (
              <div className="rounded-2xl border border-white/8 bg-white/4 px-4 py-3 text-sm text-muted-foreground">
                No matches in this chat.
              </div>
            ) : null}

            <div className="flex flex-col gap-2.5">
              {messages.map((message) => {
                const isUser = message.role === 'user'
                const label = isUser ? 'User Query' : 'Assistant Step'
                const AvatarIcon = isUser ? UserIcon : BotIcon

                return (
                  <section
                    key={message.id}
                    className={cn(
                      'rounded-2xl border px-3.5 py-3 md:px-4 md:py-3.5',
                      isUser
                        ? 'ml-auto max-w-3xl border-white/8 bg-white/4'
                        : 'mr-auto max-w-4xl border-white/8 bg-[#161616]'
                    )}
                  >
                    <div className="mb-2 flex items-center gap-2.5">
                      <div
                        className={cn(
                          'flex size-7 items-center justify-center rounded-full text-[11px] font-medium',
                          isUser ? 'bg-white/10 text-foreground' : 'bg-emerald-500/12 text-emerald-100'
                        )}
                      >
                        <AvatarIcon className="size-3.5" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-[13px] font-medium text-foreground">{label}</div>
                        <div className="text-xs text-muted-foreground">
                          {message.blocks.length} block{message.blocks.length === 1 ? '' : 's'}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col gap-3">
                      {message.blocks.map((block, blockIndex) =>
                        renderTranscriptBlock(block, `${message.id}-${blockIndex}`)
                      )}
                    </div>
                  </section>
                )
              })}
            </div>
          </div>
        ) : null}
      </div>
    </SidebarInset>
  )
}
