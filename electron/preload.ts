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
  updatedAt: string | null
}

export interface TransferResult {
  success: boolean
  message?: string
  error?: string
}

contextBridge.exposeInMainWorld('electronAPI', {
  getWorkspaces: () => ipcRenderer.invoke('get-workspaces') as Promise<Workspace[]>,
  getWorkspaceTranscripts: (dbPath: string) =>
    ipcRenderer.invoke('get-workspace-transcripts', dbPath) as Promise<WorkspaceTranscript[]>,
  transferChats: (sourceHash: string, targetHash: string) =>
    ipcRenderer.invoke('transfer-chats', { sourceHash, targetHash }) as Promise<TransferResult>,
  getChatPreview: (dbPath: string) => ipcRenderer.invoke('get-chat-preview', dbPath)
})
