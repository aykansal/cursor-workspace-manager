import { useEffect, useState } from 'react'
import type { UIEvent } from 'react'
import type { TranscriptSummary, WorkspaceScanState, WorkspaceSummary } from '../../../../electron/preload'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInput,
} from '@/components/ui/sidebar'
import { cn } from '@/lib/utils'
import { ChevronRightIcon, RefreshCwIcon, SearchIcon } from 'lucide-react'
import { getProjectName } from '../lib/workspace-utils'

type WorkspaceSidebarProps = {
  activeWorkspaceHash: string | null
  hasMore: boolean
  items: WorkspaceSummary[]
  searchQuery: string
  selectedTranscriptId: string | null
  scanState: WorkspaceScanState
  sourceHash: string | null
  transcriptListLoading: boolean
  transcriptSummariesByWorkspace: Record<string, TranscriptSummary[]>
  onLoadMore: () => void
  onRefresh: () => Promise<void> | void
  onSearchChange: (value: string) => void
  onSelectTranscript: (workspaceHash: string, transcriptId: string) => void
  onSelectWorkspace: (hash: string) => void
}

type TreeFileItem = {
  kind: 'file'
  id: string
  name: string
  isActive: boolean
  onSelect: () => void
}

type TreeFolderItem = {
  kind: 'folder'
  id: string
  name: string
  meta: string
  isActive: boolean
  isSource: boolean
  items: FileTreeItem[]
  onSelect: () => void
}

type FileTreeItem = TreeFileItem | TreeFolderItem

function formatLastUpdated(value: string | null) {
  if (!value) return ''

  const date = new Date(value)
  const diffMinutes = Math.max(1, Math.floor((Date.now() - date.getTime()) / 60000))

  if (diffMinutes < 60) return `${diffMinutes}m ago`

  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours}h ago`

  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays}d ago`
}

function buildTranscriptItems(
  workspace: WorkspaceSummary,
  transcriptSummariesByWorkspace: Record<string, TranscriptSummary[]>,
  selectedTranscriptId: string | null,
  onSelectTranscript: (workspaceHash: string, transcriptId: string) => void
): FileTreeItem[] {
  const transcripts = transcriptSummariesByWorkspace[workspace.hash] ?? []

  return transcripts.map((transcript) => ({
    kind: 'file' as const,
    id: transcript.id,
    name: transcript.title,
    isActive: selectedTranscriptId === transcript.id,
    onSelect: () => onSelectTranscript(workspace.hash, transcript.id),
  }))
}

export function WorkspaceSidebar({
  activeWorkspaceHash,
  hasMore,
  items,
  searchQuery,
  selectedTranscriptId,
  scanState,
  sourceHash,
  transcriptListLoading,
  transcriptSummariesByWorkspace,
  onLoadMore,
  onRefresh,
  onSearchChange,
  onSelectTranscript,
  onSelectWorkspace,
}: WorkspaceSidebarProps) {
  const [openFolderIds, setOpenFolderIds] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (!activeWorkspaceHash) return

    setOpenFolderIds((current) => ({
      ...current,
      [activeWorkspaceHash]: true,
    }))
  }, [activeWorkspaceHash])

  const handleScroll = (event: UIEvent<HTMLDivElement>) => {
    if (!hasMore) return

    const { scrollHeight, scrollTop, clientHeight } = event.currentTarget
    if (scrollHeight - scrollTop - clientHeight < 160) {
      onLoadMore()
    }
  }

  const fileTree: FileTreeItem[] = items.map((workspace) => ({
    kind: 'folder' as const,
    id: workspace.hash,
    name: getProjectName(workspace.projectPath) || 'Unknown project',
    meta: `${workspace.chatCount} chats${workspace.lastModified ? ` · ${formatLastUpdated(workspace.lastModified)}` : ''}`,
    isActive: activeWorkspaceHash === workspace.hash,
    isSource: sourceHash === workspace.hash,
    items: buildTranscriptItems(
      workspace,
      transcriptSummariesByWorkspace,
      selectedTranscriptId,
      onSelectTranscript
    ),
    onSelect: () => {
      setOpenFolderIds((current) => ({
        ...current,
        [workspace.hash]: !current[workspace.hash],
      }))
      onSelectWorkspace(workspace.hash)
    },
  }))

  const renderItem = (item: FileTreeItem, depth = 0) => {
    if (item.kind === 'folder') {
      const isOpen = Boolean(openFolderIds[item.id])

      return (
        <Collapsible key={item.id} open={isOpen}>
          <Button
            variant="ghost"
            size="sm"
            aria-expanded={isOpen}
            onClick={item.onSelect}
            className={cn(
              'group h-auto w-full justify-start gap-2 rounded-lg px-2 py-2 text-left transition-none hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
              item.isActive && 'bg-sidebar-accent text-sidebar-accent-foreground'
            )}
            style={{ paddingLeft: `${depth * 12 + 8}px` }}
          >
            <ChevronRightIcon className={cn('transition-transform', isOpen && 'rotate-90')} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm">{item.name}</span>
              {/* <span className="block truncate text-xs text-sidebar-foreground/45">
                {item.meta}
              </span> */}
            </span>
            {item.isSource ? (
              <span className="size-2 shrink-0 rounded-full bg-sidebar-primary" />
            ) : null}
          </Button>

          <CollapsibleContent className={cn('mt-1', !isOpen && 'hidden')}>
            <div className="flex flex-col gap-1">
              {item.items.length > 0 ? (
                item.items.map((child) => renderItem(child, depth + 1))
              ) : (
                <div
                  className="px-2 py-1 text-xs text-sidebar-foreground/45"
                  style={{ paddingLeft: `${(depth + 1) * 12 + 24}px` }}
                >
                  {item.isActive && transcriptListLoading ? 'Loading chats...' : 'No chats found'}
                </div>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )
    }

    return (
      <Button
        key={item.id}
        variant="ghost"
        size="sm"
        onClick={item.onSelect}
        className={cn(
          'h-auto w-full justify-start gap-2 rounded-lg px-2 py-1.5 text-left text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
          item.isActive && 'bg-sidebar-accent text-sidebar-accent-foreground'
        )}
        style={{ paddingLeft: `${depth * 12 + 20}px` }}
      >
        <span className="truncate text-sm">{item.name}</span>
      </Button>
    )
  }

  return (
    <Sidebar className="border-r border-sidebar-border/60" collapsible="icon" variant="inset">
      <SidebarHeader className="gap-3 px-3 py-3">
        <div className="flex items-center justify-between px-1">
          <div className="flex min-w-0 flex-col">
            <span className="text-[11px] font-medium tracking-[0.18em] uppercase text-sidebar-foreground/45">
              Explorer
            </span>
            <span className="truncate text-sm text-sidebar-foreground/70">
              {items.length} workspaces
            </span>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onRefresh}
            disabled={scanState.status === 'scanning'}
            className="text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <RefreshCwIcon className={cn(scanState.status === 'scanning' && 'animate-spin')} />
            <span className="sr-only">Refresh workspaces</span>
          </Button>
        </div>

        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-sidebar-foreground/40" />
          <SidebarInput
            value={searchQuery}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search workspaces"
            className="h-9 rounded-lg border-sidebar-border/70 bg-sidebar pl-9 text-sm"
          />
        </div>
      </SidebarHeader>

      <SidebarContent className="workspace-scroll px-2 py-2" onScroll={handleScroll}>
        <div className="flex flex-col gap-1">
          {fileTree.length > 0 ? (
            fileTree.map((item) => renderItem(item))
          ) : (
            <div className="px-2 py-8 text-sm text-sidebar-foreground/45">
              No matching workspaces.
            </div>
          )}
        </div>
      </SidebarContent>

      <SidebarFooter className="px-3 py-3">
        <div className="rounded-lg border border-sidebar-border/60 bg-sidebar px-3 py-2 text-xs text-sidebar-foreground/50">
          {scanState.status === 'scanning'
            ? 'Refreshing workspace index...'
            : hasMore
              ? `${items.length}+ visible locally`
              : `${items.length} visible locally`}
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
