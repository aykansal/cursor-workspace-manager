import { useMemo, useState } from 'react'
import type { Workspace, WorkspaceTranscript } from '../../../../electron/preload'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SidebarInset, SidebarTrigger } from '@/components/ui/sidebar'
import { Skeleton } from '@/components/ui/skeleton'
import { DownloadIcon, MoveRightIcon, RefreshCwIcon, SearchIcon } from 'lucide-react'
import { TransferStatusAlert } from './transfer-status-alert'
import { getProjectName } from '../lib/workspace-utils'

type WorkspaceDashboardProps = {
  activeWorkspace: Workspace | undefined
  sourceHash: string | null
  sourceWorkspace: Workspace | undefined
  status: string
  transcriptError: string | null
  transcriptLoading: boolean
  transcriptCount: number
  selectedTranscript: WorkspaceTranscript | null
  onRefreshTranscripts: () => Promise<void> | void
  onSelectSource: (hash: string) => void
  onTransfer: (targetHash: string) => void
}

type TranscriptBlock =
  | { type: 'text'; content: string }
  | { type: 'code'; content: string; language: string }

function parseTranscriptBlocks(content: string): TranscriptBlock[] {
  const parts = content.split(/```/)

  return parts.flatMap((part, index) => {
    if (index % 2 === 1) {
      const [languageLine, ...codeLines] = part.split('\n')
      return [
        {
          type: 'code' as const,
          language: languageLine.trim(),
          content: codeLines.join('\n').trim(),
        },
      ]
    }

    return part
      .split(/\n\s*\n/)
      .map((chunk) => chunk.trim())
      .filter(Boolean)
      .map((chunk) => ({ type: 'text' as const, content: chunk }))
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

function getSpeakerTone(text: string, index: number) {
  const normalized = text.toLowerCase()

  if (
    normalized.startsWith('assistant:') ||
    normalized.startsWith('cursor:') ||
    normalized.startsWith('nexus ai:') ||
    normalized.startsWith('ai:')
  ) {
    return { label: 'Assistant', initial: 'A', body: text.replace(/^[^:]+:\s*/i, '') }
  }

  if (
    normalized.startsWith('user:') ||
    normalized.startsWith('human:') ||
    normalized.startsWith('you:')
  ) {
    return { label: 'You', initial: 'Y', body: text.replace(/^[^:]+:\s*/i, '') }
  }

  return index % 2 === 0
    ? { label: 'You', initial: 'Y', body: text }
    : { label: 'Assistant', initial: 'A', body: text }
}

export function WorkspaceDashboard({
  activeWorkspace,
  sourceHash,
  sourceWorkspace,
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

  const activeProjectName = activeWorkspace ? getProjectName(activeWorkspace.projectPath) : 'Workspace'
  const sourceProjectName = sourceWorkspace ? getProjectName(sourceWorkspace.projectPath) : null
  const isActiveSource = Boolean(activeWorkspace && sourceHash === activeWorkspace.hash)

  const blocks = useMemo(() => {
    if (!selectedTranscript) return []

    const parsed = parseTranscriptBlocks(selectedTranscript.content)
    const query = transcriptSearch.trim().toLowerCase()

    if (!query) return parsed

    return parsed.filter((block) => block.content.toLowerCase().includes(query))
  }, [selectedTranscript, transcriptSearch])

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
            disabled={!activeWorkspace}
            onClick={() => activeWorkspace && onSelectSource(activeWorkspace.hash)}
          >
            {isActiveSource ? 'Source selected' : 'Use as source'}
          </Button>
          <Button
            size="sm"
            disabled={!activeWorkspace || !sourceHash || isActiveSource}
            onClick={() => activeWorkspace && onTransfer(activeWorkspace.hash)}
          >
            <MoveRightIcon data-icon="inline-start" />
            {sourceProjectName ? `Transfer from ${sourceProjectName}` : 'Transfer here'}
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
            {blocks.length === 0 && transcriptSearch ? (
              <div className="rounded-2xl border border-white/8 bg-white/4 px-4 py-3 text-sm text-muted-foreground">
                No matches in this chat.
              </div>
            ) : null}

            <div className="flex flex-col gap-4">
              {blocks.map((block, index) => {
                if (block.type === 'code') {
                  return (
                    <div key={`code-${index}`} className="overflow-hidden rounded-3xl border border-white/10 bg-[#111111]">
                      <div className="border-b border-white/8 px-4 py-2 text-xs uppercase tracking-[0.14em] text-muted-foreground">
                        {block.language || 'code'}
                      </div>
                      <pre className="workspace-scroll overflow-auto px-4 py-4 font-mono text-[13px] leading-7 whitespace-pre-wrap text-foreground">
                        {block.content}
                      </pre>
                    </div>
                  )
                }

                const message = getSpeakerTone(block.content, index)

                return (
                  <section key={`text-${index}`} className="rounded-3xl border border-white/8 bg-white/4 p-4 md:p-5">
                    <div className="mb-3 flex items-center gap-3">
                      <div className="flex size-8 items-center justify-center rounded-full bg-white/10 text-xs font-medium text-foreground">
                        {message.initial}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-foreground">{message.label}</div>
                        {selectedTranscript.updatedAt ? (
                          <div className="text-xs text-muted-foreground">
                            {formatTime(selectedTranscript.updatedAt)}
                          </div>
                        ) : null}
                      </div>
                    </div>
                    <div className="text-[15px] leading-8 text-foreground/90">
                      {message.body.split('\n').map((line, lineIndex) => (
                        <p key={`${index}-${lineIndex}`} className={lineIndex === 0 ? '' : 'mt-4'}>
                          {line}
                        </p>
                      ))}
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
