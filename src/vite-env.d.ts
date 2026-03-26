/// <reference types="vite/client" />

import type { TransferResult, Workspace } from '../electron/preload'

declare global {
	interface Window {
		electronAPI: {
			getWorkspaces: () => Promise<Workspace[]>
			transferChats: (sourceHash: string, targetHash: string) => Promise<TransferResult>
			getChatPreview: (dbPath: string) => Promise<unknown>
		}
	}
}

export {}
