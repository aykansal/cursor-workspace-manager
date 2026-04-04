import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react'
import type { TransferResult, Workspace, WorkspaceTranscript } from '../../../../electron/preload'
import { workspaceMatchesQuery } from '../lib/workspace-utils'

const WORKSPACE_PAGE_SIZE = 24

function sortByLastModifiedDesc(workspaces: Workspace[]): Workspace[] {
  return [...workspaces].sort((a, b) => {
    const aTime = a.lastModified ? new Date(a.lastModified).getTime() : 0
    const bTime = b.lastModified ? new Date(b.lastModified).getTime() : 0
    return bTime - aTime
  })
}

export function useWorkspaceManager() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [sourceHash, setSourceHash] = useState<string | null>(null)
  const [status, setStatus] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [visibleWorkspaceCount, setVisibleWorkspaceCount] = useState(WORKSPACE_PAGE_SIZE)
  const [activeWorkspaceHash, setActiveWorkspaceHash] = useState<string | null>(null)
  const [selectedTranscriptId, setSelectedTranscriptId] = useState<string | null>(null)
  const [transcriptsByWorkspace, setTranscriptsByWorkspace] = useState<Record<string, WorkspaceTranscript[]>>({})
  const [transcriptLoading, setTranscriptLoading] = useState(false)
  const [transcriptError, setTranscriptError] = useState<string | null>(null)

  const deferredSearchQuery = useDeferredValue(searchQuery)

  const loadWorkspaces = useCallback(async () => {
    const nextWorkspaces = await window.electronAPI.getWorkspaces()
    setWorkspaces(nextWorkspaces)
    setActiveWorkspaceHash((currentHash) => {
      if (currentHash && nextWorkspaces.some((workspace) => workspace.hash === currentHash)) {
        return currentHash
      }

      return nextWorkspaces[0]?.hash ?? null
    })
    setSourceHash((currentHash) => {
      if (!currentHash) return currentHash
      return nextWorkspaces.some((workspace) => workspace.hash === currentHash) ? currentHash : null
    })
  }, [])

  useEffect(() => {
    void loadWorkspaces()
  }, [loadWorkspaces])

  const handleTransfer = useCallback(
    async (targetHash: string) => {
      if (!sourceHash) return
      if (!confirm(`Transfer chats from ${sourceHash} -> ${targetHash}?`)) return

      const result: TransferResult = await window.electronAPI.transferChats(sourceHash, targetHash)
      setStatus(result.success ? result.message ?? '' : `Transfer failed: ${result.error}`)
      setSourceHash(null)
      setTranscriptsByWorkspace({})
      setSelectedTranscriptId(null)
      await loadWorkspaces()
    },
    [loadWorkspaces, sourceHash]
  )

  const selectedWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.hash === activeWorkspaceHash),
    [activeWorkspaceHash, workspaces]
  )

  const totalChats = useMemo(
    () => workspaces.reduce((total, workspace) => total + workspace.chatCount, 0),
    [workspaces]
  )

  const sortedWorkspaces = useMemo(() => sortByLastModifiedDesc(workspaces), [workspaces])

  const normalizedSearch = useMemo(
    () => deferredSearchQuery.trim().toLowerCase(),
    [deferredSearchQuery]
  )

  const filteredWorkspaces = useMemo(
    () => sortedWorkspaces.filter((workspace) => workspaceMatchesQuery(workspace, normalizedSearch)),
    [normalizedSearch, sortedWorkspaces]
  )

  const visibleWorkspaces = useMemo(
    () => filteredWorkspaces.slice(0, visibleWorkspaceCount),
    [filteredWorkspaces, visibleWorkspaceCount]
  )

  const hasMoreWorkspaces = visibleWorkspaceCount < filteredWorkspaces.length

  const activeWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.hash === activeWorkspaceHash),
    [activeWorkspaceHash, workspaces]
  )

  const activeTranscripts = useMemo(
    () => (activeWorkspaceHash ? transcriptsByWorkspace[activeWorkspaceHash] ?? [] : []),
    [activeWorkspaceHash, transcriptsByWorkspace]
  )

  const selectedTranscript = useMemo(() => {
    if (activeTranscripts.length === 0) return null

    if (selectedTranscriptId) {
      return activeTranscripts.find((transcript) => transcript.id === selectedTranscriptId) ?? activeTranscripts[0]
    }

    return activeTranscripts[0]
  }, [activeTranscripts, selectedTranscriptId])

  const loadWorkspaceTranscripts = useCallback(async (workspace: Workspace) => {
    setTranscriptLoading(true)
    setTranscriptError(null)

    try {
      const transcripts = await window.electronAPI.getWorkspaceTranscripts({
        dbPath: workspace.dbPath,
        projectPath: workspace.projectPath,
      })
      setTranscriptsByWorkspace((current) => ({ ...current, [workspace.hash]: transcripts }))
      setSelectedTranscriptId((currentId) => {
        if (currentId && transcripts.some((transcript) => transcript.id === currentId)) {
          return currentId
        }

        return transcripts[0]?.id ?? null
      })
    } catch (error) {
      setTranscriptError(error instanceof Error ? error.message : 'Unknown transcript error')
      setTranscriptsByWorkspace((current) => ({ ...current, [workspace.hash]: [] }))
      setSelectedTranscriptId(null)
    } finally {
      setTranscriptLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!activeWorkspace) return
    if (transcriptsByWorkspace[activeWorkspace.hash]) return

    void loadWorkspaceTranscripts(activeWorkspace)
  }, [activeWorkspace, loadWorkspaceTranscripts, transcriptsByWorkspace])

  const handleSelectWorkspace = useCallback(
    (hash: string) => {
      setActiveWorkspaceHash(hash)
      setSelectedTranscriptId(null)
    },
    []
  )

  const handleSelectTranscript = useCallback(
    (workspaceHash: string, transcriptId: string) => {
      setActiveWorkspaceHash(workspaceHash)
      setSelectedTranscriptId(transcriptId)
    },
    []
  )

  const refreshActiveWorkspace = useCallback(async () => {
    if (!activeWorkspace) {
      await loadWorkspaces()
      return
    }

    await Promise.all([loadWorkspaces(), loadWorkspaceTranscripts(activeWorkspace)])
  }, [activeWorkspace, loadWorkspaceTranscripts, loadWorkspaces])

  const loadMoreWorkspaces = useCallback(() => {
    setVisibleWorkspaceCount((count) => count + WORKSPACE_PAGE_SIZE)
  }, [])

  useEffect(() => {
    setVisibleWorkspaceCount(WORKSPACE_PAGE_SIZE)
  }, [normalizedSearch])

  return {
    activeTranscripts,
    activeWorkspace,
    activeWorkspaceHash,
    filteredWorkspaces,
    hasMoreWorkspaces,
    handleTransfer,
    handleSelectTranscript,
    handleSelectWorkspace,
    loadWorkspaces,
    loadMoreWorkspaces,
    refreshActiveWorkspace,
    searchIsStale: searchQuery !== deferredSearchQuery,
    searchQuery,
    selectedWorkspace,
    selectedTranscript,
    setSearchQuery,
    setSourceHash,
    sourceHash,
    status,
    totalChats,
    transcriptError,
    transcriptLoading,
    transcriptsByWorkspace,
    visibleWorkspaces,
    workspaces,
  }
}
