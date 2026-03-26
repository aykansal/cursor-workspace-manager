import { InspectorCard } from '@/features/workspace-manager/components/inspector-card'
import { ManagementStrip } from '@/features/workspace-manager/components/management-strip'
import { TransferStatusAlert } from '@/features/workspace-manager/components/transfer-status-alert'
import { WorkspaceTableCard } from '@/features/workspace-manager/components/workspace-table-card'
import { useWorkspaceManager } from '@/features/workspace-manager/hooks/use-workspace-manager'

function App() {
  const {
    currentPage,
    filteredWorkspaces,
    handleTransfer,
    inspectorCollapsed,
    loadWorkspaces,
    pagedWorkspaces,
    searchIsStale,
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
  } = useWorkspaceManager()

  return (
    <div className="h-screen overflow-hidden bg-background text-foreground">
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_0%_0%,hsl(0_0%_100%/0.06),transparent_26%),linear-gradient(180deg,hsl(0_0%_4%),hsl(0_0%_3%))]" />

      <main className="mx-auto flex h-full w-full max-w-300 flex-col gap-5 overflow-hidden px-4 py-5 md:px-8 md:py-8">
        {/* <HeroCard /> */}
        <ManagementStrip
          filteredCount={filteredWorkspaces.length}
          inspectorCollapsed={inspectorCollapsed}
          sourceHash={sourceHash}
          totalChats={totalChats}
          workspaceCount={workspaces.length}
          onRefresh={loadWorkspaces}
          onToggleInspector={() => setInspectorCollapsed((collapsed) => !collapsed)}
        />

        <div className={`grid min-h-0 flex-1 gap-4 ${inspectorCollapsed ? 'lg:grid-cols-1' : 'lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]'}`}>
          <WorkspaceTableCard
            currentPage={currentPage}
            items={pagedWorkspaces}
            sourceHash={sourceHash}
            searchIsStale={searchIsStale}
            searchQuery={searchQuery}
            totalPages={totalPages}
            totalRows={filteredWorkspaces.length}
            onSearchChange={setSearchQuery}
            visiblePages={visiblePages}
            onPageChange={setCurrentPage}
            onSelectSource={setSourceHash}
            onTransfer={handleTransfer}
          />

          {!inspectorCollapsed && (
            <InspectorCard selectedWorkspace={selectedWorkspace} sourceHash={sourceHash} />
          )}
        </div>

        <TransferStatusAlert status={status} />
      </main>
    </div>
  )
}

export default App