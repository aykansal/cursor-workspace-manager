import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TranscriptSummary } from '../../../../electron/preload'
import { useWorkspaceManager } from './use-workspace-manager'

const cachedWorkspaces = [
  {
    hash: 'workspace-a',
    projectPath: 'C:\\repo\\a',
    lastModified: '2026-04-09T10:00:00.000Z',
    chatCount: 2,
    dbPath: 'C:\\repo\\a\\state.vscdb',
    indexState: 'cached' as const,
  },
  {
    hash: 'workspace-b',
    projectPath: 'C:\\repo\\b',
    lastModified: '2026-04-09T09:00:00.000Z',
    chatCount: 1,
    dbPath: 'C:\\repo\\b\\state.vscdb',
    indexState: 'cached' as const,
  },
]

const transcriptSummaries = {
  'workspace-a': [
    {
      id: 'composer:1',
      sourceKey: '1',
      title: 'Chat A1',
      summary: null,
      updatedAt: '2026-04-09T10:00:00.000Z',
      transcriptPath: 'C:\\repo\\a\\1.jsonl',
      hasContent: true,
    },
  ],
  'workspace-b': [
    {
      id: 'composer:2',
      sourceKey: '2',
      title: 'Chat B1',
      summary: null,
      updatedAt: '2026-04-09T11:00:00.000Z',
      transcriptPath: 'C:\\repo\\b\\2.jsonl',
      hasContent: true,
    },
  ],
}

describe('useWorkspaceManager', () => {
  beforeEach(() => {
    const listeners = new Set<(state: any) => void>()
    let slowWorkspaceResolver: ((value: typeof transcriptSummaries['workspace-a']) => void) | null = null

    window.electronAPI = {
      listWorkspaces: vi.fn().mockResolvedValue(cachedWorkspaces),
      refreshWorkspaces: vi.fn().mockResolvedValue(cachedWorkspaces),
      getWorkspaceScanState: vi.fn().mockResolvedValue({
        status: 'ready',
        startedAt: null,
        completedAt: null,
        message: null,
      }),
      onWorkspaceScanState: vi.fn((listener) => {
        listeners.add(listener)
        return () => listeners.delete(listener)
      }),
      listWorkspaceTranscripts: vi.fn<(workspaceHash: string) => Promise<TranscriptSummary[]>>((workspaceHash: string) => {
        if (workspaceHash === 'workspace-a') {
          return new Promise<TranscriptSummary[]>((resolve) => {
            slowWorkspaceResolver = resolve
          })
        }

        return Promise.resolve(transcriptSummaries[workspaceHash as keyof typeof transcriptSummaries] ?? [])
      }),
      getTranscriptDetail: vi.fn((workspaceHash: string, transcriptId: string) =>
        Promise.resolve({
          ...(transcriptSummaries[workspaceHash as keyof typeof transcriptSummaries].find((entry) => entry.id === transcriptId)!),
          content: `detail:${transcriptId}`,
        })
      ),
      transferTranscript: vi.fn().mockResolvedValue({
        success: true,
        message: 'Chat copied to the target workspace.',
      }),
    }

    Object.assign(globalThis, {
      __workspaceManagerTest: {
        listeners,
        resolveSlowWorkspace() {
          slowWorkspaceResolver?.(transcriptSummaries['workspace-a'])
        },
      },
    })
  })

  it('loads workspace summaries before transcript detail', async () => {
    const { result } = renderHook(() => useWorkspaceManager())

    await waitFor(() => {
      expect(result.current.workspaces).toHaveLength(2)
    })

    expect(window.electronAPI.listWorkspaces).toHaveBeenCalledTimes(1)
    expect(window.electronAPI.getTranscriptDetail).not.toHaveBeenCalled()
  })

  it('loads transcript details lazily when a transcript is selected', async () => {
    const { result } = renderHook(() => useWorkspaceManager())

    await waitFor(() => {
      expect(result.current.activeWorkspaceHash).toBe('workspace-a')
    })

    act(() => {
      ;(globalThis as any).__workspaceManagerTest.resolveSlowWorkspace()
    })

    await waitFor(() => {
      expect(result.current.selectedTranscriptSummary?.id).toBe('composer:1')
    })

    await waitFor(() => {
      expect(result.current.selectedTranscript?.content).toBe('detail:composer:1')
    })
  })

  it('ignores stale transcript list responses when the user switches workspaces', async () => {
    const { result } = renderHook(() => useWorkspaceManager())

    await waitFor(() => {
      expect(result.current.activeWorkspaceHash).toBe('workspace-a')
    })

    act(() => {
      result.current.handleSelectWorkspace('workspace-b')
    })

    await waitFor(() => {
      expect(result.current.activeWorkspaceHash).toBe('workspace-b')
      expect(window.electronAPI.getTranscriptDetail).toHaveBeenCalledWith('workspace-b', 'composer:2')
    })

    act(() => {
      ;(globalThis as any).__workspaceManagerTest.resolveSlowWorkspace()
    })

    await waitFor(() => {
      expect(result.current.selectedTranscriptSummary?.id).toBe('composer:2')
      expect(result.current.selectedTranscript?.content).toBe('detail:composer:2')
    })
  })
})
