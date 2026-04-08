export type IndexState = 'cached' | 'fresh' | 'stale' | 'error'

export type WorkspaceSummary = {
  hash: string
  projectPath: string
  lastModified: string | null
  chatCount: number
  dbPath: string
  indexState: IndexState
}

export type TranscriptSummary = {
  id: string
  sourceKey: string
  title: string
  summary: string | null
  updatedAt: string | null
  transcriptPath: string
  hasContent: boolean
}

export type TranscriptDetail = TranscriptSummary & {
  content: string
}

export type WorkspaceScanState = {
  status: 'idle' | 'scanning' | 'ready' | 'error'
  startedAt: string | null
  completedAt: string | null
  message: string | null
}

export type TransferPayload = {
  sourceHash: string
  targetHash: string
  composerId: string
}

export type TransferResult = {
  success: boolean
  message?: string
  error?: string
}

export type WorkspaceCacheEntry = {
  hash: string
  projectPath: string
  dbPath: string
  lastModified: string | null
  chatCount: number
  transcripts: TranscriptCacheEntry[]
}

export type TranscriptCacheEntry = TranscriptSummary

export type WorkspaceIndexCache = {
  version: 1
  generatedAt: string
  workspaces: WorkspaceCacheEntry[]
}

export type WorkspaceIndexSnapshot = {
  workspaces: WorkspaceSummary[]
  transcriptsByWorkspace: Record<string, TranscriptSummary[]>
}

export type ServiceRequestMap = {
  listWorkspaces: undefined
  refreshWorkspaces: undefined
  getWorkspaceScanState: undefined
  listWorkspaceTranscripts: { workspaceHash: string }
  getTranscriptDetail: { workspaceHash: string; transcriptId: string }
  transferTranscript: TransferPayload
}

export type ServiceResponseMap = {
  listWorkspaces: WorkspaceSummary[]
  refreshWorkspaces: WorkspaceSummary[]
  getWorkspaceScanState: WorkspaceScanState
  listWorkspaceTranscripts: TranscriptSummary[]
  getTranscriptDetail: TranscriptDetail | null
  transferTranscript: TransferResult
}

export type ServiceRequest<K extends keyof ServiceRequestMap = keyof ServiceRequestMap> = {
  kind: 'request'
  id: string
  method: K
  params: ServiceRequestMap[K]
}

export type ServiceSuccessResponse<K extends keyof ServiceResponseMap = keyof ServiceResponseMap> = {
  kind: 'response'
  id: string
  ok: true
  result: ServiceResponseMap[K]
}

export type ServiceErrorResponse = {
  kind: 'response'
  id: string
  ok: false
  error: string
}

export type ServiceEvent = {
  kind: 'event'
  event: 'scanState'
  payload: WorkspaceScanState
}

export type ServiceMessage =
  | ServiceRequest
  | ServiceSuccessResponse
  | ServiceErrorResponse
  | ServiceEvent

export const WORKSPACE_SCAN_STATE_EVENT = 'workspace-scan-state'
