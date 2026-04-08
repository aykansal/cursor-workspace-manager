import fs from 'fs'
import path from 'path'
import type {
  TranscriptSummary,
  WorkspaceCacheEntry,
  WorkspaceIndexCache,
  WorkspaceIndexSnapshot,
  WorkspaceSummary,
} from '../contracts'
import { getAppDataPath } from './cursor-paths'

const CACHE_VERSION = 1

function getCacheDir(): string {
  return path.join(getAppDataPath(), 'Cursor Workspace Manager', 'cache')
}

export function getCacheFilePath(): string {
  return path.join(getCacheDir(), 'workspace-index.json')
}

function toSnapshot(cache: WorkspaceIndexCache, indexState: WorkspaceSummary['indexState']): WorkspaceIndexSnapshot {
  const transcriptsByWorkspace: Record<string, TranscriptSummary[]> = {}
  const workspaces: WorkspaceSummary[] = cache.workspaces.map((workspace) => {
    transcriptsByWorkspace[workspace.hash] = workspace.transcripts

    return {
      hash: workspace.hash,
      projectPath: workspace.projectPath,
      dbPath: workspace.dbPath,
      lastModified: workspace.lastModified,
      chatCount: workspace.chatCount,
      indexState,
    }
  })

  return {
    workspaces,
    transcriptsByWorkspace,
  }
}

function toCache(snapshot: WorkspaceIndexSnapshot): WorkspaceIndexCache {
  const workspaces: WorkspaceCacheEntry[] = snapshot.workspaces.map((workspace) => ({
    hash: workspace.hash,
    projectPath: workspace.projectPath,
    dbPath: workspace.dbPath,
    lastModified: workspace.lastModified,
    chatCount: workspace.chatCount,
    transcripts: snapshot.transcriptsByWorkspace[workspace.hash] ?? [],
  }))

  return {
    version: CACHE_VERSION,
    generatedAt: new Date().toISOString(),
    workspaces,
  }
}

export class CacheStore {
  private snapshot: WorkspaceIndexSnapshot = {
    workspaces: [],
    transcriptsByWorkspace: {},
  }

  read(): WorkspaceIndexSnapshot {
    const cachePath = getCacheFilePath()

    try {
      if (!fs.existsSync(cachePath)) {
        this.snapshot = { workspaces: [], transcriptsByWorkspace: {} }
        return this.snapshot
      }

      const parsed = JSON.parse(fs.readFileSync(cachePath, 'utf8')) as WorkspaceIndexCache
      if (parsed.version !== CACHE_VERSION || !Array.isArray(parsed.workspaces)) {
        this.snapshot = { workspaces: [], transcriptsByWorkspace: {} }
        return this.snapshot
      }

      this.snapshot = toSnapshot(parsed, 'cached')
      return this.snapshot
    } catch {
      this.snapshot = { workspaces: [], transcriptsByWorkspace: {} }
      return this.snapshot
    }
  }

  getSnapshot(): WorkspaceIndexSnapshot {
    return this.snapshot
  }

  setSnapshot(snapshot: WorkspaceIndexSnapshot) {
    this.snapshot = snapshot
  }

  write(snapshot: WorkspaceIndexSnapshot) {
    this.snapshot = snapshot

    const cacheDir = getCacheDir()
    const cachePath = getCacheFilePath()
    const tempPath = `${cachePath}.tmp`

    fs.mkdirSync(cacheDir, { recursive: true })
    fs.writeFileSync(tempPath, JSON.stringify(toCache(snapshot), null, 2), 'utf8')
    fs.renameSync(tempPath, cachePath)
  }
}
