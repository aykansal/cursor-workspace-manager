import { useState, useEffect } from 'react'
import type { Workspace, TransferResult } from '../electron/preload'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

function App() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [sourceHash, setSourceHash] = useState<string | null>(null)
  const [status, setStatus] = useState('')

  const loadWorkspaces = async () => {
    const ws = await window.electronAPI.getWorkspaces()
    setWorkspaces(ws)
  }

  useEffect(() => {
    loadWorkspaces()
  }, [])

  const handleTransfer = async (targetHash: string) => {
    if (!sourceHash) return
    if (!confirm(`Transfer chats from ${sourceHash} → ${targetHash}?`)) return

    const res: TransferResult = await window.electronAPI.transferChats(sourceHash, targetHash)
    setStatus(res.success ? res.message! : `❌ ${res.error}`)
    setSourceHash(null)
    loadWorkspaces()
  }

  const selectedWorkspace = workspaces.find((w) => w.hash === sourceHash)
  const totalChats = workspaces.reduce((total, workspace) => total + workspace.chatCount, 0)
  const sortedWorkspaces = [...workspaces].sort((a, b) => {
    const aTime = a.lastModified ? new Date(a.lastModified).getTime() : 0
    const bTime = b.lastModified ? new Date(b.lastModified).getTime() : 0
    return bTime - aTime
  })

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_0%_0%,hsl(0_0%_100%/0.06),transparent_26%),linear-gradient(180deg,hsl(0_0%_4%),hsl(0_0%_3%))]" />

      <main className="mx-auto flex w-full max-w-300 flex-col gap-5 px-4 py-5 md:px-8 md:py-8">
        <Card size="sm" className="border border-border/80 bg-card/80">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-3">
            <div className="flex items-center gap-2">
              <Badge variant="outline">Workspace Ops</Badge>
              <Badge variant="secondary">{workspaces.length} Nodes</Badge>
              <Badge variant="outline">{totalChats} Chats</Badge>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={sourceHash ? 'default' : 'outline'}>
                {sourceHash ? 'Source Locked' : 'No Source'}
              </Badge>
              <Button size="sm" variant="outline" onClick={loadWorkspaces}>
                Refresh
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-border/80 bg-card/85">
          <CardHeader>
            <CardTitle className="text-2xl tracking-tight md:text-4xl">Cursor Workspace Manager</CardTitle>
            <CardDescription>
              Minimal transfer control plane inspired by Linear and Notion: clean rows, fast actions, no visual noise.
            </CardDescription>
          </CardHeader>
        </Card>

        <div className="grid gap-4 lg:grid-cols-[1.8fr_1fr]">
          <Card className="overflow-hidden border border-border/80 bg-card/90">
            <CardHeader>
              <CardTitle>Workspace Index</CardTitle>
              <CardDescription>Recently modified workspaces are listed first.</CardDescription>
            </CardHeader>
            <Separator />
            <CardContent className="px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">Project</TableHead>
                    <TableHead>Hash</TableHead>
                    <TableHead className="text-center">Chats</TableHead>
                    <TableHead>Updated</TableHead>
                    <TableHead className="pr-4 text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedWorkspaces.map((workspace) => {
                    const isSource = sourceHash === workspace.hash

                    return (
                      <TableRow key={workspace.hash}>
                        <TableCell className="pl-4 font-medium">
                          <div className="flex flex-col gap-0.5">
                            <span>{workspace.projectPath.split(/[/\\]/).pop()}</span>
                            <span className="max-w-70 truncate text-xs text-muted-foreground">{workspace.projectPath}</span>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{workspace.hash}</TableCell>
                        <TableCell className="text-center">{workspace.chatCount}</TableCell>
                        <TableCell>{workspace.lastModified ? new Date(workspace.lastModified).toLocaleString() : '-'}</TableCell>
                        <TableCell className="pr-4">
                          <div className="flex justify-end gap-2">
                            <Button size="sm" variant={isSource ? 'default' : 'secondary'} onClick={() => setSourceHash(workspace.hash)}>
                              {isSource ? 'Selected' : 'Source'}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleTransfer(workspace.hash)}
                              disabled={!sourceHash || sourceHash === workspace.hash}
                            >
                              Transfer
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

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
                <span className="truncate">{selectedWorkspace?.projectPath.split(/[/\\]/).pop() ?? '-'}</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs uppercase tracking-[0.08em] text-muted-foreground">Database Path</span>
                <span className="break-all text-xs text-muted-foreground">{selectedWorkspace?.dbPath ?? '-'}</span>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <Badge variant="outline">1. Choose source</Badge>
                <Badge variant="outline">2. Transfer target</Badge>
              </div>
            </CardContent>
          </Card>
        </div>

        {status && (
          <Alert>
            <AlertTitle>Transfer Result</AlertTitle>
            <AlertDescription>{status}</AlertDescription>
          </Alert>
        )}
      </main>
    </div>
  )
}

export default App