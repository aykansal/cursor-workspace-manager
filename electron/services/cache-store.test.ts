import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CacheStore, getCacheFilePath } from './cache-store'

describe('cache-store', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('reads valid cache and ignores corrupted cache safely', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cache-store-'))
    vi.stubEnv('APPDATA', tempRoot)

    const cachePath = getCacheFilePath()
    fs.mkdirSync(path.dirname(cachePath), { recursive: true })
    fs.writeFileSync(
      cachePath,
      JSON.stringify({
        version: 1,
        generatedAt: new Date().toISOString(),
        workspaces: [
          {
            hash: 'a'.repeat(32),
            projectPath: 'C:\\repo',
            dbPath: 'C:\\repo\\state.vscdb',
            lastModified: null,
            chatCount: 1,
            transcripts: [],
          },
        ],
      }),
      'utf8'
    )

    const store = new CacheStore()
    expect(store.read().workspaces).toHaveLength(1)

    fs.writeFileSync(cachePath, '{bad json', 'utf8')
    expect(store.read().workspaces).toEqual([])
  })

  it('writes cache atomically', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cache-store-'))
    vi.stubEnv('APPDATA', tempRoot)

    const store = new CacheStore()
    store.write({
      workspaces: [
        {
          hash: 'b'.repeat(32),
          projectPath: 'C:\\repo',
          dbPath: 'C:\\repo\\state.vscdb',
          lastModified: null,
          chatCount: 0,
          indexState: 'fresh',
        },
      ],
      transcriptsByWorkspace: {
        ['b'.repeat(32)]: [],
      },
    })

    expect(fs.existsSync(getCacheFilePath())).toBe(true)
    expect(fs.existsSync(`${getCacheFilePath()}.tmp`)).toBe(false)
  })
})
