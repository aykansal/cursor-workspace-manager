import { useEffect, useMemo, useState } from 'react'
import type { Workspace, WorkspaceTranscript } from '../../../../electron/preload'
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
import { Input } from '@/components/ui/input'
import { SidebarInset, SidebarTrigger } from '@/components/ui/sidebar'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { CheckIcon, DownloadIcon, FolderSearch2Icon, MoveRightIcon, RefreshCwIcon, SearchIcon } from 'lucide-react'
import { TransferStatusAlert } from './transfer-status-alert'
import { getProjectName } from '../lib/workspace-utils'

type WorkspaceDashboardProps = {
  activeWorkspace: Workspace | undefined
  sourceHash: string | null
  sourceComposerId: string | null
  sourceComposerTitle: string | null
  sourceWorkspace: Workspace | undefined
  workspaces: Workspace[]
  status: string
  transcriptError: string | null
  transcriptLoading: boolean
  transcriptCount: number
  selectedTranscript: WorkspaceTranscript | null
  onRefreshTranscripts: () => Promise<void> | void
  onSelectSource: (hash: string, transcript: WorkspaceTranscript | null) => void
  onTransfer: (targetHash: string) => void
}

type TranscriptBlock =
  | { type: 'text'; content: string }
  | { type: 'code'; content: string; language: string }

type TranscriptMessage = {
  id: string
  role: 'user' | 'assistant'
  body: string
  blocks: TranscriptBlock[]
}

function parseTranscriptBlocks(content: string): TranscriptBlock[] {
  const parts = content.split(/```/)
  const blocks: TranscriptBlock[] = []

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

function normalizeMessageText(content: string) {
  return content
    .replace(/<user_query>\s*/gi, '')
    .replace(/\s*<\/user_query>/gi, '')
    .replace(/\[REDACTED\]/gi, '')
    .trim()
}

function parseTranscriptMessages(content: string): TranscriptMessage[] {
  const lines = content.split('\n')
  const messages: Array<{ role: 'user' | 'assistant'; bodyLines: string[] }> = []
  let current: { role: 'user' | 'assistant'; bodyLines: string[] } | null = null

  const flush = () => {
    if (!current) return

    const body = normalizeMessageText(current.bodyLines.join('\n').trim())
    if (body) {
      const previousMessage = messages[messages.length - 1]

      if (previousMessage && previousMessage.role === current.role) {
        previousMessage.bodyLines.push(body)
      } else {
        messages.push({
          role: current.role,
          bodyLines: [body],
        })
      }
    }
    current = null
  }

  for (const line of lines) {
    if (line.startsWith('User: ')) {
      flush()
      current = {
        role: 'user',
        bodyLines: [line.replace(/^User:\s*/, '')],
      }
      continue
    }

    if (line.startsWith('Assistant: ')) {
      flush()
      current = {
        role: 'assistant',
        bodyLines: [line.replace(/^Assistant:\s*/, '')],
      }
      continue
    }

    if (!current) {
      current = {
        role: 'assistant',
        bodyLines: [line],
      }
      continue
    }

    current.bodyLines.push(line)
  }

  flush()

  return messages.map((message, index) => {
    const body = message.bodyLines.join('\n').trim()

    return {
      id: `${message.role}-${index}`,
      role: message.role,
      body,
      blocks: parseTranscriptBlocks(body),
    }
  })
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
  transcriptError,
  transcriptLoading,
  transcriptCount,
  selectedTranscript,
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
    selectedTranscript?.sourceKey === sourceComposerId
  const hasSourceChat = Boolean(sourceHash && sourceComposerId)

  const messages = useMemo(() => {
    if (!selectedTranscript) return []

    const parsed = parseTranscriptMessages(selectedTranscript.content)
    const query = transcriptSearch.trim().toLowerCase()

    if (!query) return parsed

    return parsed.filter((message) =>
      message.blocks.some((block) => block.content.toLowerCase().includes(query))
    )
  }, [selectedTranscript, transcriptSearch])

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
            <RefreshCwIcon />
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

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 px-4 py-3 md:px-5">
        <div className="min-w-0">
          <div className="truncate text-sm text-foreground">
            {selectedTranscript?.title ?? 'No chat selected'}
          </div>
          <div className="truncate text-xs text-muted-foreground">
            {selectedTranscript?.updatedAt
              ? `${formatTime(selectedTranscript.updatedAt)} · ${transcriptCount} chats`
              : activeWorkspace
                ? `${transcriptCount} chats`
                : 'Open a workspace to inspect its chats'}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={isActiveSource ? 'secondary' : 'outline'}
            size="sm"
            disabled={!activeWorkspace || !selectedTranscript}
            onClick={() => activeWorkspace && onSelectSource(activeWorkspace.hash, selectedTranscript)}
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
                    className="min-w-[240px] justify-between"
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

        {activeWorkspace && transcriptLoading ? (
          <div className="mx-auto flex max-w-4xl flex-col gap-5">
            <Skeleton className="h-20 rounded-2xl bg-white/6" />
            <Skeleton className="h-28 rounded-2xl bg-white/6" />
            <Skeleton className="h-24 rounded-2xl bg-white/6" />
          </div>
        ) : null}

        {!transcriptLoading && transcriptError ? (
          <div className="mx-auto max-w-3xl rounded-2xl border border-white/10 bg-white/4 px-4 py-3 text-sm text-red-200">
            Unable to read transcript: {transcriptError}
          </div>
        ) : null}

        {!transcriptLoading && !transcriptError && !selectedTranscript && activeWorkspace ? (
          <div className="flex h-full items-center justify-center">
            <div className="max-w-sm text-center">
              <div className="text-base font-medium text-foreground">No chat selected</div>
              <div className="mt-2 text-sm leading-6 text-muted-foreground">
                Choose a chat from the workspace tree to open it in this panel.
              </div>
            </div>
          </div>
        ) : null}

        {!transcriptLoading && !transcriptError && selectedTranscript ? (
          <div className="mx-auto max-w-4xl">
            {messages.length === 0 && transcriptSearch ? (
              <div className="rounded-2xl border border-white/8 bg-white/4 px-4 py-3 text-sm text-muted-foreground">
                No matches in this chat.
              </div>
            ) : null}

            <div className="flex flex-col gap-2.5">
              {messages.map((message) => {
                const isUser = message.role === 'user'
                const label = isUser ? 'You' : 'Assistant'
                const initial = isUser ? 'Y' : 'A'

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
                        {initial}
                      </div>
                      <div className="min-w-0">
                        <div className="text-[13px] font-medium text-foreground">{label}</div>
                        {selectedTranscript.updatedAt ? (
                          <div className="text-xs text-muted-foreground">
                            {formatTime(selectedTranscript.updatedAt)}
                          </div>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex flex-col gap-3">
                      {message.blocks.map((block, blockIndex) => {
                        if (block.type === 'code') {
                          return (
                            <div key={`${message.id}-code-${blockIndex}`} className="overflow-hidden rounded-xl border border-white/10 bg-[#111111]">
                              <div className="border-b border-white/8 px-4 py-2 text-xs uppercase tracking-[0.14em] text-muted-foreground">
                                {block.language || 'code'}
                              </div>
                              <pre className="workspace-scroll overflow-auto px-4 py-4 font-mono text-[13px] leading-7 whitespace-pre-wrap text-foreground">
                                {block.content}
                              </pre>
                            </div>
                          )
                        }

                        return (
                          <div key={`${message.id}-text-${blockIndex}`} className="text-[14px] leading-7 text-foreground/90">
                            {block.content.split('\n').map((line, lineIndex) => (
                              <p key={`${message.id}-${blockIndex}-${lineIndex}`} className={lineIndex === 0 ? '' : 'mt-3'}>
                                {line}
                              </p>
                            ))}
                          </div>
                        )
                      })}
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
