import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getCursorProjectRoots, getTranscriptFilePath, getWslRemoteInfo, resolveTranscriptFilePath, toCursorProjectSlug } from './cursor-paths'

describe('cursor-paths', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('converts project paths to Cursor slugs', () => {
    expect(toCursorProjectSlug('C:\\Users\\ayver\\my repo')).toBe('c-Users-ayver-my-repo')
  })

  it('resolves WSL remote info correctly', () => {
    expect(getWslRemoteInfo('vscode-remote://wsl+Ubuntu/home/ayver/project')).toEqual({
      distro: 'Ubuntu',
      linuxPath: '/home/ayver/project',
    })
  })

  it('generates transcript paths for WSL-backed workspaces', () => {
    vi.spyOn(os, 'homedir').mockReturnValue('C:\\Users\\tester')

    expect(getTranscriptFilePath('vscode-remote://wsl+Ubuntu/home/ayver/project', 'composer-1')).toContain(
      path.win32.join('\\\\wsl.localhost\\Ubuntu', 'home', 'ayver', '.cursor', 'projects')
    )
    expect(getCursorProjectRoots('vscode-remote://wsl+Ubuntu/home/ayver/project')[0]).toContain(
      '\\\\wsl.localhost\\Ubuntu\\home\\ayver\\.cursor\\projects'
    )
  })

  it('falls back across project roots when the direct path is missing', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cursor-paths-'))
    vi.spyOn(os, 'homedir').mockReturnValue(tempRoot)

    const fallback = path.join(tempRoot, '.cursor', 'projects', 'alternate', 'agent-transcripts', 'composer-1', 'composer-1.jsonl')
    fs.mkdirSync(path.dirname(fallback), { recursive: true })
    fs.writeFileSync(fallback, '{}\n', 'utf8')

    expect(resolveTranscriptFilePath('C:\\repo\\project', 'composer-1')).toBe(fallback)
    expect(resolveTranscriptFilePath('C:\\repo\\project', 'missing')).toContain('missing.jsonl')
  })
})
