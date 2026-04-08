import { contextBridge, ipcRenderer } from 'electron'
import type {
  TranscriptDetail,
  TranscriptSummary,
  TransferPayload,
  TransferResult,
  WorkspaceScanState,
  WorkspaceSummary,
} from './contracts'
import { WORKSPACE_SCAN_STATE_EVENT } from './contracts'

export type {
  TranscriptDetail,
  TranscriptSummary,
  TransferPayload,
  TransferResult,
  WorkspaceScanState,
  WorkspaceSummary,
} from './contracts'
export type Workspace = WorkspaceSummary

contextBridge.exposeInMainWorld('electronAPI', {
  listWorkspaces: () => ipcRenderer.invoke('workspace:list') as Promise<WorkspaceSummary[]>,
  refreshWorkspaces: () => ipcRenderer.invoke('workspace:refresh') as Promise<WorkspaceSummary[]>,
  getWorkspaceScanState: () => ipcRenderer.invoke('workspace:scan-state') as Promise<WorkspaceScanState>,
  onWorkspaceScanState: (listener: (state: WorkspaceScanState) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, state: WorkspaceScanState) => {
      listener(state)
    }

    ipcRenderer.on(WORKSPACE_SCAN_STATE_EVENT, wrapped)

    return () => {
      ipcRenderer.removeListener(WORKSPACE_SCAN_STATE_EVENT, wrapped)
    }
  },
  listWorkspaceTranscripts: (workspaceHash: string) =>
    ipcRenderer.invoke('workspace:transcripts', workspaceHash) as Promise<TranscriptSummary[]>,
  getTranscriptDetail: (workspaceHash: string, transcriptId: string) =>
    ipcRenderer.invoke('workspace:transcript-detail', {
      workspaceHash,
      transcriptId,
    }) as Promise<TranscriptDetail | null>,
  transferTranscript: (payload: TransferPayload) =>
    ipcRenderer.invoke('workspace:transfer', payload) as Promise<TransferResult>,
})
