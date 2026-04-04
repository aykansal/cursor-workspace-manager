import { useMemo } from 'react'
import { SidebarProvider } from '@/components/ui/sidebar'
import { WorkspaceDashboard } from '@/features/workspace-manager/components/workspace-dashboard'
import { WorkspaceSidebar } from '@/features/workspace-manager/components/workspace-sidebar'
import { useWorkspaceManager } from '@/features/workspace-manager/hooks/use-workspace-manager'

function App() {
  const {
    activeTranscripts,
    activeWorkspace,
    activeWorkspaceHash,
    hasMoreWorkspaces,
    handleTransfer,
    handleSelectTranscript,
    handleSelectWorkspace,
    loadWorkspaces,
    loadMoreWorkspaces,
    refreshActiveWorkspace,
    searchIsStale,
    searchQuery,
    selectedTranscript,
    setSearchQuery,
    setSourceHash,
    sourceHash,
    status,
    transcriptError,
    transcriptLoading,
    transcriptsByWorkspace,
    visibleWorkspaces,
    workspaces,
  } = useWorkspaceManager()

  const sourceWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.hash === sourceHash),
    [sourceHash, workspaces]
  )

  return (
    <SidebarProvider
      defaultOpen
      className="h-screen overflow-hidden bg-background text-foreground"
    >
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,hsl(0_0%_100%/0.05),transparent_20%),linear-gradient(180deg,hsl(0_0%_8%),hsl(0_0%_5%))]" />

      <WorkspaceSidebar
        activeWorkspaceHash={activeWorkspaceHash}
        hasMore={hasMoreWorkspaces}
        items={visibleWorkspaces}
        searchIsStale={searchIsStale}
        searchQuery={searchQuery}
        selectedTranscriptId={selectedTranscript?.id ?? null}
        sourceHash={sourceHash}
        transcriptLoading={transcriptLoading}
        transcriptsByWorkspace={transcriptsByWorkspace}
        onLoadMore={loadMoreWorkspaces}
        onRefresh={loadWorkspaces}
        onSearchChange={setSearchQuery}
        onSelectTranscript={handleSelectTranscript}
        onSelectWorkspace={handleSelectWorkspace}
      />

      <WorkspaceDashboard
        activeWorkspace={activeWorkspace}
        sourceHash={sourceHash}
        sourceWorkspace={sourceWorkspace}
        status={status}
        transcriptError={transcriptError}
        transcriptLoading={transcriptLoading}
        transcriptCount={activeTranscripts.length}
        selectedTranscript={selectedTranscript}
        onRefreshTranscripts={refreshActiveWorkspace}
        onSelectSource={setSourceHash}
        onTransfer={handleTransfer}
      />
    </SidebarProvider>
  )
}

export default App
