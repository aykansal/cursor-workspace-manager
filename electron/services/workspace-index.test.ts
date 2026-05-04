import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getTranscriptFilePath } from './cursor-paths'

type DbEntry = {
  composerValue?: string
  throwOnOpen?: boolean
}

const dbEntries = new Map<string, DbEntry>()

vi.mock('./sqlite', () => ({
  Database: class MockDatabase {
    constructor(private readonly dbPath: string) {
      const entry = dbEntries.get(dbPath)
      if (entry?.throwOnOpen) {
        throw new Error('broken db')
      }
    }

    prepare(_sql: string) {
      return {
        get: () => {
          const entry = dbEntries.get(this.dbPath)
          return entry?.composerValue ? { value: entry.composerValue } : undefined
        },
      }
    }

    close() {
      // noop
    }
  },
}))

function createWorkspace(tempRoot: string, hash: string, folderValue?: string, composerData?: Record<string, unknown>) {
  const workspaceDir = path.join(tempRoot, 'Cursor', 'User', 'workspaceStorage', hash)
  fs.mkdirSync(workspaceDir, { recursive: true })

  if (folderValue !== undefined) {
    fs.writeFileSync(path.join(workspaceDir, 'workspace.json'), JSON.stringify({ folder: folderValue }), 'utf8')
  } else {
    fs.writeFileSync(path.join(workspaceDir, 'workspace.json'), '{bad json', 'utf8')
  }

  const dbPath = path.join(workspaceDir, 'state.vscdb')
  fs.writeFileSync(dbPath, '', 'utf8')
  dbEntries.set(dbPath, {
    composerValue: composerData ? JSON.stringify(composerData) : undefined,
  })
}

describe('workspace-index', () => {
  beforeEach(() => {
    dbEntries.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('returns empty results when workspace storage is missing', async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workspace-index-'))
    vi.stubEnv('APPDATA', tempRoot)

    const { scanWorkspaceStorage } = await import('./workspace-index')
    expect(scanWorkspaceStorage()).toEqual({
      workspaces: [],
      transcriptsByWorkspace: {},
    })
  })

  it('returns expected workspace summaries and transcript metadata without reading transcript bodies', async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workspace-index-'))
    vi.stubEnv('APPDATA', tempRoot)
    vi.spyOn(os, 'homedir').mockReturnValue(tempRoot)

    createWorkspace(tempRoot, 'a'.repeat(32), 'file:///C:/repo/project', {
      ['workbench.panel.aichat.view.composer-1']: {
        collapsed: false,
        isHidden: false,
        size: 940,
      },
    })

    const globalStorageDir = path.join(tempRoot, 'Cursor', 'User', 'globalStorage')
    fs.mkdirSync(globalStorageDir, { recursive: true })
    const globalDbPath = path.join(globalStorageDir, 'state.vscdb')
    fs.writeFileSync(globalDbPath, '', 'utf8')
    dbEntries.set(globalDbPath, {
      composerValue: JSON.stringify({
        allComposers: [
          {
            composerId: 'composer-1',
            name: 'Refactor session',
            subtitle: 'Edited app.ts',
            lastUpdatedAt: '2026-04-09T10:00:00.000Z',
            workspaceIdentifier: {
              id: 'a'.repeat(32),
            },
          },
        ],
      }),
    })

    const transcriptPath = getTranscriptFilePath('C:\\repo\\project', 'composer-1')
    fs.mkdirSync(path.dirname(transcriptPath), { recursive: true })
    fs.writeFileSync(transcriptPath, JSON.stringify({ role: 'user', message: { text: 'hello' } }), 'utf8')

    const readSpy = vi.spyOn(fs, 'readFileSync')
    const { scanWorkspaceStorage } = await import('./workspace-index')
    const result = scanWorkspaceStorage()

    expect(result.workspaces).toHaveLength(1)
    expect(result.workspaces[0]).toMatchObject({
      hash: 'a'.repeat(32),
      projectPath: 'C:/repo/project',
      chatCount: 1,
      indexState: 'fresh',
    })
    expect(result.transcriptsByWorkspace['a'.repeat(32)][0]).toMatchObject({
      id: 'composer:composer-1',
      title: 'Refactor session',
      summary: 'Edited app.ts',
      hasContent: true,
    })
    expect(
      readSpy.mock.calls.some(([calledPath]) => String(calledPath).includes(`${path.sep}agent-transcripts${path.sep}`))
    ).toBe(false)
  })

  it('falls back to Unknown for invalid workspace metadata and tolerates broken databases', async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workspace-index-'))
    vi.stubEnv('APPDATA', tempRoot)

    const brokenWorkspaceDir = path.join(tempRoot, 'Cursor', 'User', 'workspaceStorage', 'b'.repeat(32))
    fs.mkdirSync(brokenWorkspaceDir, { recursive: true })
    fs.writeFileSync(path.join(brokenWorkspaceDir, 'workspace.json'), '{bad json', 'utf8')
    const dbPath = path.join(brokenWorkspaceDir, 'state.vscdb')
    fs.writeFileSync(dbPath, '', 'utf8')
    dbEntries.set(dbPath, { throwOnOpen: true })

    const { scanWorkspaceStorage } = await import('./workspace-index')
    const result = scanWorkspaceStorage()

    expect(result.workspaces[0]).toMatchObject({
      hash: 'b'.repeat(32),
      projectPath: 'Unknown',
      chatCount: 0,
      indexState: 'error',
    })
  })
})
