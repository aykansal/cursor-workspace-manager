import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

type ManagementStripProps = {
  filteredCount: number
  inspectorCollapsed: boolean
  searchIsStale: boolean
  searchQuery: string
  sourceHash: string | null
  totalChats: number
  workspaceCount: number
  onRefresh: () => Promise<void> | void
  onSearchChange: (value: string) => void
  onToggleInspector: () => void
}

export function ManagementStrip({
  filteredCount,
  inspectorCollapsed,
  searchIsStale,
  searchQuery,
  sourceHash,
  totalChats,
  workspaceCount,
  onRefresh,
  onSearchChange,
  onToggleInspector,
}: ManagementStripProps) {
  return (
    <Card size="sm" className="border border-border/80 bg-card/80">
      <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-3">
        <div className="flex items-center gap-2">
          <Badge variant="outline">Workspace Ops</Badge>
          <Badge variant="secondary">{workspaceCount} Nodes</Badge>
          <Badge variant="outline">{totalChats} Chats</Badge>
          <Badge variant="outline">{filteredCount} Results</Badge>
          {searchIsStale ? <Badge variant="secondary">Updating...</Badge> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={searchQuery}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search all entries by hash, path, project, or chat count"
            className="w-80 max-w-full"
          />
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
