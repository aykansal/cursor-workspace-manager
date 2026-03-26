import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react'
import type { TransferResult, Workspace } from '../../../../electron/preload'
import { PAGE_SIZE, workspaceMatchesQuery } from '../lib/workspace-utils'

function sortByLastModifiedDesc(workspaces: Workspace[]): Workspace[] {
  return [...workspaces].sort((a, b) => {
    const aTime = a.lastModified ? new Date(a.lastModified).getTime() : 0
    const bTime = b.lastModified ? new Date(b.lastModified).getTime() : 0
    return bTime - aTime
  })
}

function getVisiblePages(currentPage: number, totalPages: number): number[] {
  const start = Math.max(1, currentPage - 2)
  const end = Math.min(totalPages, start + 4)
  const pages: number[] = []

  for (let page = Math.max(1, end - 4); page <= end; page += 1) {
    pages.push(page)
  }

  return pages
}

export function useWorkspaceManager() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [sourceHash, setSourceHash] = useState<string | null>(null)
  const [status, setStatus] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [inspectorCollapsed, setInspectorCollapsed] = useState(true)

  const deferredSearchQuery = useDeferredValue(searchQuery)

  const loadWorkspaces = useCallback(async () => {
    const nextWorkspaces = await window.electronAPI.getWorkspaces()
    setWorkspaces(nextWorkspaces)
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
      await loadWorkspaces()
    },
    [loadWorkspaces, sourceHash]
  )

  const selectedWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.hash === sourceHash),
    [sourceHash, workspaces]
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

  const totalPages = Math.max(1, Math.ceil(filteredWorkspaces.length / PAGE_SIZE))

  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery])

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages)
    }
  }, [currentPage, totalPages])

  const pagedWorkspaces = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE
    return filteredWorkspaces.slice(start, start + PAGE_SIZE)
  }, [currentPage, filteredWorkspaces])

  const visiblePages = useMemo(
    () => getVisiblePages(currentPage, totalPages),
    [currentPage, totalPages]
  )

  return {
    currentPage,
    filteredWorkspaces,
    handleTransfer,
    inspectorCollapsed,
    loadWorkspaces,
    pagedWorkspaces,
    searchIsStale: searchQuery !== deferredSearchQuery,
    searchQuery,
    selectedWorkspace,
    setCurrentPage,
    setInspectorCollapsed,
    setSearchQuery,
    setSourceHash,
    sourceHash,
    status,
    totalChats,
    totalPages,
    visiblePages,
    workspaces,
  }
}
