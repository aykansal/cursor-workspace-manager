/// <reference types="vite/client" />

import type {
	TranscriptDetail,
	TranscriptSummary,
	TransferPayload,
	TransferResult,
	WorkspaceScanState,
	WorkspaceSummary,
} from '../electron/preload'

declare global {
	interface Window {
		electronAPI: {
			listWorkspaces: () => Promise<WorkspaceSummary[]>
			refreshWorkspaces: () => Promise<WorkspaceSummary[]>
			getWorkspaceScanState: () => Promise<WorkspaceScanState>
			onWorkspaceScanState: (listener: (state: WorkspaceScanState) => void) => () => void
			listWorkspaceTranscripts: (workspaceHash: string) => Promise<TranscriptSummary[]>
			getTranscriptDetail: (workspaceHash: string, transcriptId: string) => Promise<TranscriptDetail | null>
			transferTranscript: (payload: TransferPayload) => Promise<TransferResult>
		}
	}
}

export {}
