/// <reference types="vite/client" />

import type { TransferResult, Workspace, WorkspaceTranscript } from '../electron/preload'

declare global {
	interface Window {
		electronAPI: {
			getWorkspaces: () => Promise<Workspace[]>
			getWorkspaceTranscripts: (dbPath: string) => Promise<WorkspaceTranscript[]>
			transferChats: (sourceHash: string, targetHash: string) => Promise<TransferResult>
			getChatPreview: (dbPath: string) => Promise<unknown>
		}
	}
}

export {}
