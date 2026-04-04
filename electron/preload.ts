import { contextBridge, ipcRenderer } from 'electron'

export interface Workspace {
  hash: string
  projectPath: string
  chatCount: number
  chatPreviews: string[]
  lastModified: string | null
  dbPath: string
}

export interface WorkspaceTranscript {
  id: string
  sourceKey: string
  title: string
  summary: string | null
  content: string
  transcriptPath: string
  updatedAt: string | null
}

export interface TransferResult {
  success: boolean
  message?: string
  error?: string
}

contextBridge.exposeInMainWorld('electronAPI', {
  getWorkspaces: () => ipcRenderer.invoke('get-workspaces') as Promise<Workspace[]>,
  getWorkspaceTranscripts: (workspace: { dbPath: string; projectPath: string }) =>
    ipcRenderer.invoke('get-workspace-transcripts', workspace) as Promise<WorkspaceTranscript[]>,
  transferChats: (payload: { sourceHash: string; targetHash: string; composerId: string }) =>
    ipcRenderer.invoke('transfer-chats', payload) as Promise<TransferResult>,
  getChatPreview: (dbPath: string) => ipcRenderer.invoke('get-chat-preview', dbPath)
})
