import { useMemo } from 'react'
import { SidebarProvider } from '@/components/ui/sidebar'
import { WorkspaceDashboard } from '@/features/workspace-manager/components/workspace-dashboard'
import { WorkspaceSidebar } from '@/features/workspace-manager/components/workspace-sidebar'
import { useWorkspaceManager } from '@/features/workspace-manager/hooks/use-workspace-manager'

function App() {
  const {
    activeTranscriptSummaries,
    activeWorkspace,
    activeWorkspaceHash,
    hasMoreWorkspaces,
    handleTransfer,
    handleSelectTranscript,
    handleSelectWorkspace,
    refreshWorkspaces,
    loadMoreWorkspaces,
    refreshActiveWorkspace,
    scanState,
    searchQuery,
    selectedTranscript,
    selectedTranscriptSummary,
    setSearchQuery,
    handleSetSourceSelection,
    sourceHash,
    sourceComposerId,
    sourceComposerTitle,
    status,
    transcriptError,
    transcriptDetailLoading,
    transcriptListLoading,
    transcriptSummariesByWorkspace,
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
        searchQuery={searchQuery}
        selectedTranscriptId={selectedTranscriptSummary?.id ?? null}
        scanState={scanState}
        sourceHash={sourceHash}
        transcriptListLoading={transcriptListLoading}
        transcriptSummariesByWorkspace={transcriptSummariesByWorkspace}
        onLoadMore={loadMoreWorkspaces}
        onRefresh={refreshWorkspaces}
        onSearchChange={setSearchQuery}
        onSelectTranscript={handleSelectTranscript}
        onSelectWorkspace={handleSelectWorkspace}
      />

      <WorkspaceDashboard
        activeWorkspace={activeWorkspace}
        sourceHash={sourceHash}
        sourceComposerId={sourceComposerId}
        sourceComposerTitle={sourceComposerTitle}
        sourceWorkspace={sourceWorkspace}
        workspaces={workspaces}
        status={status}
        scanState={scanState}
        transcriptError={transcriptError}
        transcriptDetailLoading={transcriptDetailLoading}
        transcriptListLoading={transcriptListLoading}
        transcriptCount={activeTranscriptSummaries.length}
        selectedTranscript={selectedTranscript}
        selectedTranscriptSummary={selectedTranscriptSummary}
        onRefreshTranscripts={refreshActiveWorkspace}
        onSelectSource={handleSetSourceSelection}
        onTransfer={handleTransfer}
      />
    </SidebarProvider>
  )
}

export default App
