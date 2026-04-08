import { startTransition, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import type {
  TranscriptDetail,
  TranscriptSummary,
  TransferResult,
  WorkspaceScanState,
  WorkspaceSummary,
} from '../../../../electron/preload'
import { getProjectName, workspaceMatchesQuery } from '../lib/workspace-utils'

const WORKSPACE_PAGE_SIZE = 24

function sortByLastModifiedDesc(workspaces: WorkspaceSummary[]): WorkspaceSummary[] {
  return [...workspaces].sort((a, b) => {
    const aTime = a.lastModified ? new Date(a.lastModified).getTime() : 0
    const bTime = b.lastModified ? new Date(b.lastModified).getTime() : 0
    return bTime - aTime
  })
}

export function useWorkspaceManager() {
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([])
  const [scanState, setScanState] = useState<WorkspaceScanState>({
    status: 'idle',
    startedAt: null,
    completedAt: null,
    message: null,
  })
  const [sourceHash, setSourceHash] = useState<string | null>(null)
  const [sourceComposerId, setSourceComposerId] = useState<string | null>(null)
  const [sourceComposerTitle, setSourceComposerTitle] = useState<string | null>(null)
  const [status, setStatus] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [visibleWorkspaceCount, setVisibleWorkspaceCount] = useState(WORKSPACE_PAGE_SIZE)
  const [activeWorkspaceHash, setActiveWorkspaceHash] = useState<string | null>(null)
  const [selectedTranscriptId, setSelectedTranscriptId] = useState<string | null>(null)
  const [transcriptSummariesByWorkspace, setTranscriptSummariesByWorkspace] = useState<Record<string, TranscriptSummary[]>>({})
  const [transcriptDetailsById, setTranscriptDetailsById] = useState<Record<string, TranscriptDetail>>({})
  const [transcriptListLoadingByWorkspace, setTranscriptListLoadingByWorkspace] = useState<Record<string, boolean>>({})
  const [transcriptDetailLoadingId, setTranscriptDetailLoadingId] = useState<string | null>(null)
  const [transcriptError, setTranscriptError] = useState<string | null>(null)

  const deferredSearchQuery = useDeferredValue(searchQuery)
  const workspaceLoadRequestId = useRef(0)
  const transcriptListRequestIdByWorkspace = useRef<Record<string, number>>({})
  const transcriptDetailRequestId = useRef(0)

  const applyWorkspaces = useCallback((nextWorkspaces: WorkspaceSummary[]) => {
    startTransition(() => {
      setWorkspaces(nextWorkspaces)
      setActiveWorkspaceHash((currentHash) => {
        if (currentHash && nextWorkspaces.some((workspace) => workspace.hash === currentHash)) {
          return currentHash
        }

        return nextWorkspaces[0]?.hash ?? null
      })
      setSourceHash((currentHash) => {
        if (!currentHash) return currentHash

        const nextSourceHash = nextWorkspaces.some((workspace) => workspace.hash === currentHash)
          ? currentHash
          : null

        if (!nextSourceHash) {
          setSourceComposerId(null)
          setSourceComposerTitle(null)
        }

        return nextSourceHash
      })
    })
  }, [])

  const loadWorkspaces = useCallback(async () => {
    const requestId = ++workspaceLoadRequestId.current
    const nextWorkspaces = await window.electronAPI.listWorkspaces()

    if (requestId !== workspaceLoadRequestId.current) return
    applyWorkspaces(nextWorkspaces)
  }, [applyWorkspaces])

  const refreshWorkspaces = useCallback(async () => {
    const requestId = ++workspaceLoadRequestId.current
    const nextWorkspaces = await window.electronAPI.refreshWorkspaces()

    if (requestId !== workspaceLoadRequestId.current) return
    applyWorkspaces(nextWorkspaces)
  }, [applyWorkspaces])

  const loadWorkspaceTranscripts = useCallback(
    async (workspaceHash: string, options?: { force?: boolean }) => {
      if (!options?.force && transcriptSummariesByWorkspace[workspaceHash]) {
        return transcriptSummariesByWorkspace[workspaceHash]
      }

      const requestId = (transcriptListRequestIdByWorkspace.current[workspaceHash] ?? 0) + 1
      transcriptListRequestIdByWorkspace.current[workspaceHash] = requestId

      setTranscriptListLoadingByWorkspace((current) => ({ ...current, [workspaceHash]: true }))
      setTranscriptError(null)

      try {
        const transcripts = await window.electronAPI.listWorkspaceTranscripts(workspaceHash)

        if (transcriptListRequestIdByWorkspace.current[workspaceHash] !== requestId) {
          return transcripts
        }

        setTranscriptSummariesByWorkspace((current) => ({ ...current, [workspaceHash]: transcripts }))

        if (workspaceHash === activeWorkspaceHash) {
          setSelectedTranscriptId((currentId) => {
            if (currentId && transcripts.some((transcript) => transcript.id === currentId)) {
              return currentId
            }

            return transcripts[0]?.id ?? null
          })
        }

        return transcripts
      } catch (error) {
        if (transcriptListRequestIdByWorkspace.current[workspaceHash] === requestId) {
          setTranscriptError(error instanceof Error ? error.message : 'Unknown transcript error')
          setTranscriptSummariesByWorkspace((current) => ({ ...current, [workspaceHash]: [] }))
          if (workspaceHash === activeWorkspaceHash) {
            setSelectedTranscriptId(null)
          }
        }

        return []
      } finally {
        if (transcriptListRequestIdByWorkspace.current[workspaceHash] === requestId) {
          setTranscriptListLoadingByWorkspace((current) => ({ ...current, [workspaceHash]: false }))
        }
      }
    },
    [activeWorkspaceHash, transcriptSummariesByWorkspace]
  )

  const loadTranscriptDetail = useCallback(
    async (workspaceHash: string, transcriptId: string) => {
      const existing = transcriptDetailsById[transcriptId]
      if (existing) return existing

      const requestId = ++transcriptDetailRequestId.current
      setTranscriptDetailLoadingId(transcriptId)
      setTranscriptError(null)

      try {
        const detail = await window.electronAPI.getTranscriptDetail(workspaceHash, transcriptId)
        if (requestId !== transcriptDetailRequestId.current) return detail

        if (detail) {
          setTranscriptDetailsById((current) => ({ ...current, [transcriptId]: detail }))
        }

        return detail
      } catch (error) {
        if (requestId === transcriptDetailRequestId.current) {
          setTranscriptError(error instanceof Error ? error.message : 'Unknown transcript error')
        }

        return null
      } finally {
        if (requestId === transcriptDetailRequestId.current) {
          setTranscriptDetailLoadingId((current) => (current === transcriptId ? null : current))
        }
      }
    },
    [transcriptDetailsById]
  )

  useEffect(() => {
    void loadWorkspaces()
    void window.electronAPI.getWorkspaceScanState().then(setScanState)

    const unsubscribe = window.electronAPI.onWorkspaceScanState((nextState) => {
      setScanState(nextState)

      if (nextState.status === 'ready') {
        void loadWorkspaces()
      }
    })

    return unsubscribe
  }, [loadWorkspaces])

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

  const activeTranscriptSummaries = useMemo(
    () => (activeWorkspaceHash ? transcriptSummariesByWorkspace[activeWorkspaceHash] ?? [] : []),
    [activeWorkspaceHash, transcriptSummariesByWorkspace]
  )

  const selectedTranscriptSummary = useMemo(() => {
    if (activeTranscriptSummaries.length === 0) return null

    if (selectedTranscriptId) {
      return (
        activeTranscriptSummaries.find((transcript) => transcript.id === selectedTranscriptId) ??
        activeTranscriptSummaries[0]
      )
    }

    return activeTranscriptSummaries[0]
  }, [activeTranscriptSummaries, selectedTranscriptId])

  const selectedTranscript = useMemo(
    () => (selectedTranscriptSummary ? transcriptDetailsById[selectedTranscriptSummary.id] ?? null : null),
    [selectedTranscriptSummary, transcriptDetailsById]
  )

  useEffect(() => {
    if (!activeWorkspaceHash) return
    if (transcriptSummariesByWorkspace[activeWorkspaceHash]) return

    void loadWorkspaceTranscripts(activeWorkspaceHash)
  }, [activeWorkspaceHash, loadWorkspaceTranscripts, transcriptSummariesByWorkspace])

  useEffect(() => {
    if (!activeWorkspaceHash || !selectedTranscriptSummary) return
    if (transcriptDetailsById[selectedTranscriptSummary.id]) return

    void loadTranscriptDetail(activeWorkspaceHash, selectedTranscriptSummary.id)
  }, [activeWorkspaceHash, loadTranscriptDetail, selectedTranscriptSummary, transcriptDetailsById])

  const handleTransfer = useCallback(
    async (targetHash: string) => {
      if (!sourceHash || !sourceComposerId) {
        setStatus('Select a source chat before transferring.')
        return
      }

      const sourceWorkspaceName =
        getProjectName(workspaces.find((workspace) => workspace.hash === sourceHash)?.projectPath ?? '') ||
        sourceHash
      const targetWorkspaceName =
        getProjectName(workspaces.find((workspace) => workspace.hash === targetHash)?.projectPath ?? '') ||
        targetHash

      const confirmed = confirm(
        `Copy "${sourceComposerTitle ?? 'selected chat'}" from ${sourceWorkspaceName} into ${targetWorkspaceName}?`
      )

      if (!confirmed) return

      const result: TransferResult = await window.electronAPI.transferTranscript({
        sourceHash,
        targetHash,
        composerId: sourceComposerId,
      })

      setStatus(result.success ? result.message ?? '' : `Transfer failed: ${result.error}`)

      if (!result.success) return

      setTranscriptSummariesByWorkspace((current) => {
        const next = { ...current }
        delete next[targetHash]
        return next
      })

      await refreshWorkspaces()
      await loadWorkspaceTranscripts(targetHash, { force: true })
    },
    [loadWorkspaceTranscripts, refreshWorkspaces, sourceComposerId, sourceComposerTitle, sourceHash, workspaces]
  )

  const handleSelectWorkspace = useCallback((hash: string) => {
    setActiveWorkspaceHash(hash)
    setSelectedTranscriptId(null)
  }, [])

  const handleSelectTranscript = useCallback((workspaceHash: string, transcriptId: string) => {
    setActiveWorkspaceHash(workspaceHash)
    setSelectedTranscriptId(transcriptId)
  }, [])

  const handleSetSourceSelection = useCallback(
    (workspaceHash: string, transcript: TranscriptSummary | null) => {
      if (!transcript) {
        setStatus('Open a chat first, then mark it as the source.')
        return
      }

      setSourceHash(workspaceHash)
      setSourceComposerId(transcript.sourceKey)
      setSourceComposerTitle(transcript.title)
      setStatus(`Source set to "${transcript.title}".`)
    },
    []
  )

  const refreshActiveWorkspace = useCallback(async () => {
    await refreshWorkspaces()

    if (activeWorkspaceHash) {
      await loadWorkspaceTranscripts(activeWorkspaceHash, { force: true })

      const currentTranscriptId = selectedTranscriptId
      if (currentTranscriptId) {
        setTranscriptDetailsById((current) => {
          const next = { ...current }
          delete next[currentTranscriptId]
          return next
        })
        await loadTranscriptDetail(activeWorkspaceHash, currentTranscriptId)
      }
    }
  }, [activeWorkspaceHash, loadTranscriptDetail, loadWorkspaceTranscripts, refreshWorkspaces, selectedTranscriptId])

  const loadMoreWorkspaces = useCallback(() => {
    setVisibleWorkspaceCount((count) => count + WORKSPACE_PAGE_SIZE)
  }, [])

  useEffect(() => {
    setVisibleWorkspaceCount(WORKSPACE_PAGE_SIZE)
  }, [normalizedSearch])

  return {
    activeTranscriptSummaries,
    activeWorkspace,
    activeWorkspaceHash,
    filteredWorkspaces,
    hasMoreWorkspaces,
    handleSetSourceSelection,
    handleSelectTranscript,
    handleSelectWorkspace,
    handleTransfer,
    loadMoreWorkspaces,
    loadTranscriptDetail,
    loadWorkspaceTranscripts,
    loadWorkspaces,
    refreshActiveWorkspace,
    refreshWorkspaces,
    scanState,
    searchIsStale: searchQuery !== deferredSearchQuery,
    searchQuery,
    selectedTranscript,
    selectedTranscriptSummary,
    selectedWorkspace,
    setSearchQuery,
    sourceComposerId,
    sourceComposerTitle,
    sourceHash,
    status,
    totalChats,
    transcriptDetailLoading: Boolean(
      selectedTranscriptSummary && transcriptDetailLoadingId === selectedTranscriptSummary.id
    ),
    transcriptError,
    transcriptListLoading: Boolean(activeWorkspaceHash && transcriptListLoadingByWorkspace[activeWorkspaceHash]),
    transcriptSummariesByWorkspace,
    visibleWorkspaces,
    workspaces,
  }
}
