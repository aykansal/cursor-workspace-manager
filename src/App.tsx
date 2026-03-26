import { useState, useEffect, useMemo } from 'react'
import type { Workspace, TransferResult } from '../electron/preload'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

const PAGE_SIZE = 50

function App() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [sourceHash, setSourceHash] = useState<string | null>(null)
  const [status, setStatus] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false)

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

  const selectedWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.hash === sourceHash),
    [sourceHash, workspaces]
  )

  const totalChats = useMemo(
    () => workspaces.reduce((total, workspace) => total + workspace.chatCount, 0),
    [workspaces]
  )

  const sortedWorkspaces = useMemo(() => {
    return [...workspaces].sort((a, b) => {
      const aTime = a.lastModified ? new Date(a.lastModified).getTime() : 0
      const bTime = b.lastModified ? new Date(b.lastModified).getTime() : 0
      return bTime - aTime
    })
  }, [workspaces])

  const normalizedSearch = searchQuery.trim().toLowerCase()

  const filteredWorkspaces = useMemo(() => {
    if (!normalizedSearch) return sortedWorkspaces

    return sortedWorkspaces.filter((workspace) => {
      const projectName = workspace.projectPath.split(/[/\\]/).pop() ?? ''
      const searchable = [
        workspace.hash,
        workspace.projectPath,
        projectName,
        String(workspace.chatCount),
      ]
        .join(' ')
        .toLowerCase()

      return searchable.includes(normalizedSearch)
    })
  }, [normalizedSearch, sortedWorkspaces])

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

  const visiblePages = useMemo(() => {
    const start = Math.max(1, currentPage - 2)
    const end = Math.min(totalPages, start + 4)
    const pages: number[] = []

    for (let page = Math.max(1, end - 4); page <= end; page += 1) {
      pages.push(page)
    }

    return pages
  }, [currentPage, totalPages])

  return (
    <div className="h-screen overflow-hidden bg-background text-foreground">
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_0%_0%,hsl(0_0%_100%/0.06),transparent_26%),linear-gradient(180deg,hsl(0_0%_4%),hsl(0_0%_3%))]" />

      <main className="mx-auto flex h-full w-full max-w-300 flex-col gap-5 overflow-hidden px-4 py-5 md:px-8 md:py-8">
        <Card size="sm" className="border border-border/80 bg-card/80">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-3">
            <div className="flex items-center gap-2">
              <Badge variant="outline">Workspace Ops</Badge>
              <Badge variant="secondary">{workspaces.length} Nodes</Badge>
              <Badge variant="outline">{totalChats} Chats</Badge>
              <Badge variant="outline">{filteredWorkspaces.length} Results</Badge>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search all entries by hash, path, project, or chat count"
                className="w-80 max-w-full"
              />
              <Badge variant={sourceHash ? 'default' : 'outline'}>
                {sourceHash ? 'Source Locked' : 'No Source'}
              </Badge>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setInspectorCollapsed((collapsed) => !collapsed)}
              >
                {inspectorCollapsed ? 'Show Inspector' : 'Hide Inspector'}
              </Button>
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

        <div className={`grid min-h-0 flex-1 gap-4 ${inspectorCollapsed ? 'lg:grid-cols-1' : 'lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]'}`}>
          <Card className="min-h-0 overflow-hidden border border-border/80 bg-card/90">
            <CardHeader>
              <CardTitle>Workspace Index</CardTitle>
              <CardDescription>
                Showing {pagedWorkspaces.length} of {filteredWorkspaces.length} filtered rows. Page {currentPage} / {totalPages}.
              </CardDescription>
            </CardHeader>
            <Separator />
            <CardContent className="min-h-0 flex-1 px-0">
              <div className="workspace-scroll h-full overflow-auto">
                <Table className="table-fixed">
                <TableHeader className="sticky top-0 z-10 bg-card">
                  <TableRow>
                    <TableHead className="w-72 pl-4">Project</TableHead>
                    <TableHead className="w-52">Hash</TableHead>
                    <TableHead className="w-20 text-center">Chats</TableHead>
                    <TableHead className="w-56">Updated</TableHead>
                    <TableHead className="w-44 pr-4 text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedWorkspaces.map((workspace) => {
                    const isSource = sourceHash === workspace.hash

                    return (
                      <TableRow key={workspace.hash}>
                        <TableCell className="pl-4 font-medium">
                          <div className="flex flex-col gap-0.5">
                            <span>{workspace.projectPath.split(/[/\\]/).pop()}</span>
                            <span className="max-w-70 truncate text-xs text-muted-foreground">{workspace.projectPath}</span>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground" title={workspace.hash}>
                          {workspace.hash.slice(0, 12)}...
                        </TableCell>
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
              </div>
            </CardContent>
            <CardFooter className="justify-between border-t bg-card/85">
              <span className="text-xs text-muted-foreground">
                Rows per page: {PAGE_SIZE}
              </span>
              <div className="flex items-center gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                  disabled={currentPage === 1}
                >
                  Previous
                </Button>
                {visiblePages.map((page) => (
                  <Button
                    key={page}
                    size="sm"
                    variant={page === currentPage ? 'default' : 'outline'}
                    onClick={() => setCurrentPage(page)}
                  >
                    {page}
                  </Button>
                ))}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                  disabled={currentPage === totalPages}
                >
                  Next
                </Button>
              </div>
            </CardFooter>
          </Card>

          {!inspectorCollapsed && (
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
          )}
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