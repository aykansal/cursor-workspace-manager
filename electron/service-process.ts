import type {
  ServiceMessage,
  ServiceRequest,
  ServiceResponseMap,
  TranscriptDetail,
  TranscriptSummary,
  TransferPayload,
  WorkspaceIndexSnapshot,
  WorkspaceScanState,
  WorkspaceSummary,
} from './contracts'
import { CacheStore } from './services/cache-store'
import { applyIndexState, scanWorkspace, scanWorkspaceStorage } from './services/workspace-index'
import { getTranscriptDetail as loadTranscriptDetail } from './services/transcript-store'
import { transferTranscript } from './services/workspace-transfer'

class WorkspaceServiceProcess {
  private readonly cacheStore = new CacheStore()
  private snapshot: WorkspaceIndexSnapshot = {
    workspaces: [],
    transcriptsByWorkspace: {},
  }
  private scanPromise: Promise<void> | null = null
  private scanState: WorkspaceScanState = {
    status: 'idle',
    startedAt: null,
    completedAt: null,
    message: null,
  }

  constructor() {
    this.snapshot = this.cacheStore.read()
    this.publishScanState()
    queueMicrotask(() => {
      void this.startScan('Initial workspace scan in progress')
    })
  }

  handleMessage(message: ServiceMessage) {
    if (message.kind !== 'request') return
    void this.handleRequest(message)
  }

  private async handleRequest<K extends keyof ServiceResponseMap>(request: ServiceRequest<K>) {
    try {
      const result = await this.dispatch(request)
      this.send({
        kind: 'response',
        id: request.id,
        ok: true,
        result,
      })
    } catch (error) {
      this.send({
        kind: 'response',
        id: request.id,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  private async dispatch<K extends keyof ServiceResponseMap>(request: ServiceRequest<K>): Promise<ServiceResponseMap[K]> {
    switch (request.method) {
      case 'listWorkspaces':
        return this.snapshot.workspaces as ServiceResponseMap[K]
      case 'refreshWorkspaces':
        void this.startScan('Refreshing workspaces')
        return this.snapshot.workspaces as ServiceResponseMap[K]
      case 'getWorkspaceScanState':
        return this.scanState as ServiceResponseMap[K]
      case 'listWorkspaceTranscripts': {
        const params = request.params as { workspaceHash: string }
        return this.listWorkspaceTranscripts(params.workspaceHash) as ServiceResponseMap[K]
      }
      case 'getTranscriptDetail': {
        const params = request.params as { workspaceHash: string; transcriptId: string }
        return this.getTranscriptDetail(params.workspaceHash, params.transcriptId) as ServiceResponseMap[K]
      }
      case 'transferTranscript':
        return this.transferTranscriptAndRefresh(request.params as TransferPayload) as ServiceResponseMap[K]
      default: {
        const exhaustiveCheck: never = request.method
        throw new Error(`Unsupported service method: ${String(exhaustiveCheck)}`)
      }
    }
  }

  private listWorkspaceTranscripts(workspaceHash: string): TranscriptSummary[] {
    const existing = this.snapshot.transcriptsByWorkspace[workspaceHash]
    if (existing) return existing

    const refreshed = scanWorkspace(workspaceHash)
    this.snapshot = {
      workspaces: this.mergeWorkspaceSummary(refreshed.summary),
      transcriptsByWorkspace: {
        ...this.snapshot.transcriptsByWorkspace,
        [workspaceHash]: refreshed.transcripts,
      },
    }
    this.persistSnapshot()

    return refreshed.transcripts
  }

  private getTranscriptDetail(workspaceHash: string, transcriptId: string): TranscriptDetail | null {
    const transcript = this.listWorkspaceTranscripts(workspaceHash).find((entry) => entry.id === transcriptId)
    return transcript ? loadTranscriptDetail(transcript) : null
  }

  private transferTranscriptAndRefresh(payload: TransferPayload) {
    const result = transferTranscript(payload)
    if (!result.success) return result

    const refreshedTarget = scanWorkspace(payload.targetHash)
    this.snapshot = {
      workspaces: this.mergeWorkspaceSummary(refreshedTarget.summary),
      transcriptsByWorkspace: {
        ...this.snapshot.transcriptsByWorkspace,
        [payload.targetHash]: refreshedTarget.transcripts,
      },
    }
    this.persistSnapshot()

    return result
  }

  private mergeWorkspaceSummary(summary: WorkspaceSummary): WorkspaceSummary[] {
    const next = this.snapshot.workspaces.filter((workspace) => workspace.hash !== summary.hash)
    next.push(summary)

    return next.sort((a, b) => {
      const aTime = a.lastModified ? new Date(a.lastModified).getTime() : 0
      const bTime = b.lastModified ? new Date(b.lastModified).getTime() : 0
      return bTime - aTime
    })
  }

  private async startScan(message: string) {
    if (this.scanPromise) return this.scanPromise

    this.scanState = {
      status: 'scanning',
      startedAt: new Date().toISOString(),
      completedAt: this.scanState.completedAt,
      message,
    }
    this.publishScanState()

    this.scanPromise = Promise.resolve()
      .then(() => scanWorkspaceStorage())
      .then((snapshot) => {
        this.snapshot = applyIndexState(snapshot, 'fresh')
        this.persistSnapshot()
        this.scanState = {
          status: 'ready',
          startedAt: this.scanState.startedAt,
          completedAt: new Date().toISOString(),
          message: null,
        }
        this.publishScanState()
      })
      .catch((error) => {
        this.snapshot = applyIndexState(this.snapshot, 'stale')
        this.scanState = {
          status: 'error',
          startedAt: this.scanState.startedAt,
          completedAt: new Date().toISOString(),
          message: error instanceof Error ? error.message : String(error),
        }
        this.publishScanState()
      })
      .finally(() => {
        this.scanPromise = null
      })

    return this.scanPromise
  }

  private persistSnapshot() {
    try {
      this.cacheStore.write(this.snapshot)
    } catch {
      // Cache persistence failures must not block scan completion.
    }
  }

  private publishScanState() {
    this.send({
      kind: 'event',
      event: 'scanState',
      payload: this.scanState,
    })
  }

  private send(message: ServiceMessage) {
    if (typeof process.send === 'function') {
      process.send(message)
    }
  }
}

const service = new WorkspaceServiceProcess()

process.on('message', (message: ServiceMessage) => {
  service.handleMessage(message)
})
