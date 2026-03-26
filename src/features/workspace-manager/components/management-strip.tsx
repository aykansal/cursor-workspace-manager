import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

type ManagementStripProps = {
  filteredCount: number
  inspectorCollapsed: boolean
  sourceHash: string | null
  totalChats: number
  workspaceCount: number
  onRefresh: () => Promise<void> | void
  onToggleInspector: () => void
}

export function ManagementStrip({
  filteredCount,
  inspectorCollapsed,
  sourceHash,
  totalChats,
  workspaceCount,
  onRefresh,
  onToggleInspector,
}: ManagementStripProps) {
  return (
    <Card size="sm" className="border border-border/80 bg-card/80">
      <CardContent className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Badge variant="outline">Workspace Ops</Badge>
          <Badge variant="secondary">{workspaceCount} Nodes</Badge>
          <Badge variant="outline">{totalChats} Chats</Badge>
          <Badge variant="outline">{filteredCount} Results</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={sourceHash ? 'default' : 'outline'}>
            {sourceHash ? 'Source Locked' : 'No Source'}
          </Badge>
          <Button size="sm" variant="outline" onClick={onToggleInspector}>
            {inspectorCollapsed ? 'Show Inspector' : 'Hide Inspector'}
          </Button>
          <Button size="sm" variant="outline" onClick={onRefresh}>
            Refresh
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
