import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getTranscriptFilePath } from './cursor-paths'

type ComposerStore = Record<string, unknown>

const dbState = new Map<string, ComposerStore>()

vi.mock('./sqlite', () => ({
  Database: class MockDatabase {
    constructor(private readonly dbPath: string) {}

    prepare(sql: string) {
      if (sql.startsWith('SELECT value')) {
        return {
          get: () => {
            const value = dbState.get(this.dbPath)
            return value ? { value: JSON.stringify(value) } : undefined
          },
        }
      }

      return {
        run: (_key: string, value: string) => {
          dbState.set(this.dbPath, JSON.parse(value))
        },
      }
    }

    transaction(callback: () => void) {
      return () => callback()
    }

    close() {
      // noop
    }
  },
}))

function createWorkspace(tempRoot: string, hash: string, projectPath: string, composerIds: string[]) {
  const workspaceDir = path.join(tempRoot, 'Cursor', 'User', 'workspaceStorage', hash)
  fs.mkdirSync(workspaceDir, { recursive: true })
  fs.writeFileSync(path.join(workspaceDir, 'workspace.json'), JSON.stringify({ folder: `file:///${projectPath.replace(/\\/g, '/')}` }), 'utf8')

  const dbPath = path.join(workspaceDir, 'state.vscdb')
  fs.writeFileSync(dbPath, '', 'utf8')
  dbState.set(dbPath, {
    allComposers: composerIds.map((composerId) => ({
      composerId,
      name: composerId,
      updatedAt: '2026-04-09T10:00:00.000Z',
    })),
  })
}

describe('workspace-transfer', () => {
  beforeEach(() => {
    dbState.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('copies transcript and updates target composer data', async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workspace-transfer-'))
    vi.stubEnv('APPDATA', tempRoot)
    vi.spyOn(os, 'homedir').mockReturnValue(tempRoot)

    createWorkspace(tempRoot, 'a'.repeat(32), 'C:\\repo\\source', ['composer-1'])
    createWorkspace(tempRoot, 'b'.repeat(32), 'C:\\repo\\target', [])

    const sourceTranscript = getTranscriptFilePath('C:\\repo\\source', 'composer-1')
    fs.mkdirSync(path.dirname(sourceTranscript), { recursive: true })
    fs.writeFileSync(sourceTranscript, JSON.stringify({ role: 'user', message: { text: 'hello' } }), 'utf8')

    const { transferTranscript } = await import('./workspace-transfer')
    const result = transferTranscript({
      sourceHash: 'a'.repeat(32),
      targetHash: 'b'.repeat(32),
      composerId: 'composer-1',
    })

    expect(result.success).toBe(true)
    expect(fs.existsSync(getTranscriptFilePath('C:\\repo\\target', 'composer-1'))).toBe(true)
    expect(JSON.stringify(dbState.get(path.join(tempRoot, 'Cursor', 'User', 'workspaceStorage', 'b'.repeat(32), 'state.vscdb')))).toContain('composer-1')
    expect(fs.readdirSync(path.join(tempRoot, 'Desktop', 'Cursor-Backups')).length).toBeGreaterThan(0)
  })

  it('rejects same-source-target transfer', async () => {
    const { transferTranscript } = await import('./workspace-transfer')

    expect(
      transferTranscript({
        sourceHash: 'same',
        targetHash: 'same',
        composerId: 'composer-1',
      })
    ).toEqual({
      success: false,
      error: 'Source and target workspaces must be different.',
    })
  })
})
