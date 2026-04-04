import type { Workspace } from '../../../../electron/preload'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { getProjectName } from '../lib/workspace-utils'

type InspectorCardProps = {
  selectedWorkspace?: Workspace
  sourceHash: string | null
}

export function InspectorCard({ selectedWorkspace, sourceHash }: InspectorCardProps) {
  return (
    <Card className="border border-border/80 bg-card/90">
      <CardHeader>
        <CardTitle>Inspector</CardTitle>
        <CardDescription>Current source and transfer context.</CardDescription>
      </CardHeader>
      <Separator />
      <CardContent className="flex flex-col gap-4 pt-4">
        <div className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-[0.08em] text-muted-foreground">Selected Hash</span>
          <span className="font-mono text-xs break-all">{sourceHash ?? '-'}</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-[0.08em] text-muted-foreground">Project</span>
          <span className="truncate">{selectedWorkspace ? getProjectName(selectedWorkspace.projectPath) : '-'}</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-[0.08em] text-muted-foreground">Database Path</span>
          <span className="break-all text-xs text-muted-foreground">{selectedWorkspace?.dbPath ?? '-'}</span>
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-xs uppercase tracking-[0.08em] text-muted-foreground">Detected Chats</span>
          {selectedWorkspace?.chatPreviews?.length ? (
            <div className="flex flex-wrap gap-2">
              {selectedWorkspace.chatPreviews.map((chat, index) => (
                <Badge key={`${chat}-${index}`} variant="secondary">
                  {chat}
                </Badge>
              ))}
            </div>
          ) : (
            <span className="text-sm text-muted-foreground">No chats detected for this workspace.</span>
          )}
        </div>
        <div className="flex items-center gap-2 pt-1">
          <Badge variant="outline">1. Choose source</Badge>
          <Badge variant="outline">2. Transfer target</Badge>
        </div>
      </CardContent>
    </Card>
  )
}
