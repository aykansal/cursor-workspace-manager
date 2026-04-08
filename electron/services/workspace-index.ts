import fs from 'fs'
import path from 'path'
import type DatabaseType from 'better-sqlite3'
import type { IndexState, TranscriptSummary, WorkspaceIndexSnapshot, WorkspaceSummary } from '../contracts'
import { logger } from '../logger'
import {
  getWorkspaceDbPath,
  getWorkspaceDir,
  getWorkspaceProjectPath,
  getWorkspaceStoragePath,
  resolveTranscriptFilePath,
} from './cursor-paths'
import { Database } from './sqlite'
import { toIsoDate, toText } from './shared'

type ComposerRecord = {
  composerId: string
  title: string
  summary: string | null
  updatedAt: string | null
}

type ComposerData = {
  allComposers?: Array<Record<string, unknown>>
  selectedComposerIds?: string[]
  lastFocusedComposerIds?: string[]
  hasMigratedComposerData?: boolean
  hasMigratedMultipleComposers?: boolean
  [key: string]: unknown
}

type WorkspaceScanEntry = {
  summary: WorkspaceSummary
  transcripts: TranscriptSummary[]
}

function isComposerRecord(value: ComposerRecord | null): value is ComposerRecord {
  return value !== null
}

export function readComposerData(db: DatabaseType.Database): ComposerData {
  const row = db
    .prepare(`SELECT value FROM ItemTable WHERE key = 'composer.composerData'`)
    .get() as { value?: string } | undefined

  if (!row?.value) {
    return {
      allComposers: [],
      selectedComposerIds: [],
      lastFocusedComposerIds: [],
      hasMigratedComposerData: true,
      hasMigratedMultipleComposers: true,
    }
  }

  try {
    return JSON.parse(row.value) as ComposerData
  } catch {
    return {
      allComposers: [],
      selectedComposerIds: [],
      lastFocusedComposerIds: [],
      hasMigratedComposerData: true,
      hasMigratedMultipleComposers: true,
    }
  }
}

export function writeComposerData(db: DatabaseType.Database, composerData: ComposerData) {
  db.prepare('INSERT OR REPLACE INTO ItemTable (key, value) VALUES (?, ?)').run(
    'composer.composerData',
    JSON.stringify(composerData)
  )
}

function extractComposerRecords(rawValue?: string, projectPath?: string): ComposerRecord[] {
  if (!rawValue) return []

  try {
    const parsed = JSON.parse(rawValue) as { allComposers?: Array<Record<string, unknown>> }
    if (!Array.isArray(parsed.allComposers)) return []

    return parsed.allComposers
      .filter((composer) => composer && typeof composer === 'object')
      .map<ComposerRecord | null>((composer, index) => {
        const composerId = toText(composer.composerId) ?? `composer-${index + 1}`
        const name = toText(composer.name) ?? toText(composer.title)
        const subtitle = toText(composer.subtitle)
        const unifiedMode = toText(composer.unifiedMode)
        const forceMode = toText(composer.forceMode)
        const modeLabel = [unifiedMode, forceMode].filter(Boolean).join(' / ')
        const filesChanged =
          typeof composer.filesChangedCount === 'number'
            ? `${composer.filesChangedCount} files changed`
            : null
        const contextUsage =
          typeof composer.contextUsagePercent === 'number'
            ? `${composer.contextUsagePercent.toFixed(1)}% context used`
            : null
        const title =
          name ??
          subtitle ??
          (unifiedMode
            ? `${unifiedMode[0]?.toUpperCase() ?? 'S'}${unifiedMode.slice(1)} session ${index + 1}`
            : `Session ${index + 1}`)

        const hasVisibleMetadata = Boolean(name || subtitle)
        const hasTranscript = projectPath
          ? fs.existsSync(resolveTranscriptFilePath(projectPath, composerId))
          : false

        if (!hasVisibleMetadata && !hasTranscript) {
          return null
        }

        return {
          composerId,
          title,
          summary: subtitle ?? modeLabel ?? filesChanged ?? contextUsage ?? null,
          updatedAt: toIsoDate(composer.lastUpdatedAt ?? composer.updatedAt ?? composer.createdAt ?? null),
        } satisfies ComposerRecord
      })
      .filter(isComposerRecord)
  } catch {
    return []
  }
}

function readComposerRecords(db: DatabaseType.Database, projectPath: string): ComposerRecord[] {
  const row = db
    .prepare(`SELECT value FROM ItemTable WHERE key = 'composer.composerData'`)
    .get() as { value?: string } | undefined

  return extractComposerRecords(row?.value, projectPath)
}

function buildTranscriptSummary(projectPath: string, composer: ComposerRecord): TranscriptSummary {
  const transcriptPath = resolveTranscriptFilePath(projectPath, composer.composerId)
  const hasContent = fs.existsSync(transcriptPath)

  return {
    id: `composer:${composer.composerId}`,
    sourceKey: composer.composerId,
    title: composer.title,
    summary: composer.summary,
    updatedAt: composer.updatedAt,
    transcriptPath,
    hasContent,
  }
}

function sortWorkspaces(workspaces: WorkspaceSummary[]): WorkspaceSummary[] {
  return [...workspaces].sort((a, b) => {
    const aTime = a.lastModified ? new Date(a.lastModified).getTime() : 0
    const bTime = b.lastModified ? new Date(b.lastModified).getTime() : 0
    return bTime - aTime
  })
}

function sortTranscripts(transcripts: TranscriptSummary[]): TranscriptSummary[] {
  return [...transcripts].sort((a, b) => {
    const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0
    const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0
    return bTime - aTime
  })
}

function buildWorkspaceSummary(
  hash: string,
  dbPath: string,
  projectPath: string,
  lastModified: string | null,
  transcripts: TranscriptSummary[],
  indexState: IndexState
): WorkspaceSummary {
  return {
    hash,
    projectPath,
    lastModified,
    chatCount: transcripts.length,
    dbPath,
    indexState,
  }
}

export function scanWorkspace(hash: string): WorkspaceScanEntry {
  const dbPath = getWorkspaceDbPath(hash)
  const projectPath = getWorkspaceProjectPath(hash)
  const lastModified = fs.existsSync(dbPath) ? fs.statSync(dbPath).mtime.toISOString() : null

  if (!fs.existsSync(dbPath)) {
    return {
      summary: buildWorkspaceSummary(hash, dbPath, projectPath, lastModified, [], 'fresh'),
      transcripts: [],
    }
  }

  try {
    const db = new Database(dbPath, { readonly: true })
    const transcripts = sortTranscripts(
      readComposerRecords(db, projectPath).map((composer) => buildTranscriptSummary(projectPath, composer))
    )
    db.close()

    return {
      summary: buildWorkspaceSummary(hash, dbPath, projectPath, lastModified, transcripts, 'fresh'),
      transcripts,
    }
  } catch (error) {
    logger.error('Workspace database read failed:', {
      hash,
      dbPath,
      error: error instanceof Error ? error.message : String(error),
    })

    return {
      summary: buildWorkspaceSummary(hash, dbPath, projectPath, lastModified, [], 'error'),
      transcripts: [],
    }
  }
}

export function scanWorkspaceStorage(): WorkspaceIndexSnapshot {
  const storagePath = getWorkspaceStoragePath()
  if (!fs.existsSync(storagePath)) {
    return {
      workspaces: [],
      transcriptsByWorkspace: {},
    }
  }

  const hashes = fs
    .readdirSync(storagePath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.length === 32)
    .map((entry) => entry.name)

  const entries = hashes.map((hash) => scanWorkspace(hash))
  const transcriptsByWorkspace = Object.fromEntries(entries.map((entry) => [entry.summary.hash, entry.transcripts]))

  return {
    workspaces: sortWorkspaces(entries.map((entry) => entry.summary)),
    transcriptsByWorkspace,
  }
}

export function applyIndexState(snapshot: WorkspaceIndexSnapshot, indexState: IndexState): WorkspaceIndexSnapshot {
  return {
    workspaces: snapshot.workspaces.map((workspace) => ({
      ...workspace,
      indexState: workspace.indexState === 'error' ? 'error' : indexState,
    })),
    transcriptsByWorkspace: snapshot.transcriptsByWorkspace,
  }
}

export function workspaceExists(hash: string): boolean {
  return fs.existsSync(getWorkspaceDir(hash))
}

export function getWorkspaceProjectPathFromDbPath(dbPath: string): string {
  const workspaceDir = path.dirname(dbPath)
  const hash = path.basename(workspaceDir)
  return getWorkspaceProjectPath(hash)
}
