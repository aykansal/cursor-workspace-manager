import { contextBridge, ipcRenderer } from 'electron'

export interface Workspace {
  hash: string
  projectPath: string
  chatCount: number
  chatPreviews: string[]
  lastModified: string | null
  dbPath: string
}

export interface TransferResult {
  success: boolean
  message?: string
  error?: string
}

contextBridge.exposeInMainWorld('electronAPI', {
  getWorkspaces: () => ipcRenderer.invoke('get-workspaces') as Promise<Workspace[]>,
  transferChats: (sourceHash: string, targetHash: string) =>
    ipcRenderer.invoke('transfer-chats', { sourceHash, targetHash }) as Promise<TransferResult>,
  getChatPreview: (dbPath: string) => ipcRenderer.invoke('get-chat-preview', dbPath)
})
