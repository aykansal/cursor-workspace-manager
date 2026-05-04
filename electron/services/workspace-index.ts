import fs from 'fs'
import path from 'path'
import type DatabaseType from 'better-sqlite3'
import type { IndexState, TranscriptSummary, WorkspaceIndexSnapshot, WorkspaceSummary } from '../contracts'
import { logger } from '../logger'
import {
  getGlobalStorageDbPath,
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
  transcriptPath?: string
}

type ComposerData = {
  selectedComposerIds?: string[]
  lastFocusedComposerIds?: string[]
  hasMigratedComposerData?: boolean
  hasMigratedMultipleComposers?: boolean
}

type ComposerPaneState = {
  [key: string]: {
    collapsed?: boolean
    isHidden?: boolean
    size?: number
  }
}

type ComposerHeadersPayload = {
  allComposers?: unknown[]
}

type ComposerHeaderEntry = {
  composerId?: unknown
  name?: unknown
  subtitle?: unknown
  lastUpdatedAt?: unknown
  conversationCheckpointLastUpdatedAt?: unknown
  createdAt?: unknown
  workspaceIdentifier?: {
    id?: unknown
  }
}

type WorkspaceScanEntry = {
  summary: WorkspaceSummary
  transcripts: TranscriptSummary[]
}

function normalizeTitle(title: string, maxLength = 80): string {
  const collapsed = title.replace(/\s+/g, ' ').trim()
  if (collapsed.length <= maxLength) return collapsed
  return `${collapsed.slice(0, maxLength - 1).trimEnd()}…`
}

function getFallbackComposerTitle(composerId: string): string {
  return `Session ${composerId}`
}

function isFallbackComposerTitle(title: string, composerId: string): boolean {
  return title === getFallbackComposerTitle(composerId)
}

function extractTextContent(content: unknown): string {
  if (typeof content === 'string') {
    return content.trim()
  }

  if (!Array.isArray(content)) {
    return ''
  }

  const parts: string[] = []
  for (const item of content) {
    if (!item || typeof item !== 'object') continue
    const contentItem = item as { type?: string; text?: unknown; content?: unknown }

    if (contentItem.type === 'image_url' || contentItem.type === 'input_image' || contentItem.type === 'file') {
      continue
    }

    if (typeof contentItem.text === 'string') {
      parts.push(contentItem.text.trim())
      continue
    }

    const nestedText = extractTextContent(contentItem.content)
    if (nestedText) {
      parts.push(nestedText)
    }
  }

  return parts.join(' ').trim()
}

function deriveTitleFromTranscript(transcriptPath: string, composerId: string): string {
  try {
    const transcript = fs.readFileSync(transcriptPath, 'utf8')
    for (const line of transcript.split(/\r?\n/)) {
      if (!line.trim()) continue

      const entry = JSON.parse(line) as { role?: string; message?: { content?: unknown } }
      if (entry.role !== 'user') continue

      const title = extractTextContent(entry.message?.content)
      if (title) {
        return normalizeTitle(title)
      }
    }
  } catch {
    // Fall back below.
  }

  return `Session ${composerId}`
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

function extractComposerRecords(rawValue?: string): ComposerRecord[] {
  if (!rawValue) return []

  try {
    const parsed = JSON.parse(rawValue) as ComposerPaneState
    if (!parsed || typeof parsed !== 'object') return []

    return Object.keys(parsed)
      .filter((viewKey) => viewKey.startsWith('workbench.panel.aichat.view.'))
      .map<ComposerRecord | null>((viewKey) => {
        const composerId = viewKey.replace('workbench.panel.aichat.view.', '')
        if (!composerId) return null

        return {
          composerId,
          title: getFallbackComposerTitle(composerId),
          summary: null,
          updatedAt: null,
        }
      })
      .filter(isComposerRecord)
  } catch {
    return []
  }
}

function readComposerRecords(db: DatabaseType.Database): ComposerRecord[] {
  const rows = db
    .prepare("SELECT value FROM ItemTable WHERE key LIKE 'workbench.panel.composerChatViewPane.%' ORDER BY key")
    .all() as Array<{ value?: string }>

  return rows.flatMap((row) => extractComposerRecords(row.value))
}

function readComposerMetadataIndex(): Map<string, Map<string, ComposerRecord>> {
  const globalStorageDbPath = getGlobalStorageDbPath()
  if (!fs.existsSync(globalStorageDbPath)) {
    return new Map()
  }

  try {
    const db = new Database(globalStorageDbPath, { readonly: true })
    const row = db
      .prepare(`SELECT value FROM ItemTable WHERE key = 'composer.composerHeaders'`)
      .get() as { value?: string } | undefined
    db.close()

    if (!row?.value) return new Map()

    const parsed = JSON.parse(row.value) as ComposerHeadersPayload
    if (!Array.isArray(parsed.allComposers)) return new Map()

    const metadataByWorkspace = new Map<string, Map<string, ComposerRecord>>()

    for (const item of parsed.allComposers) {
      if (!item || typeof item !== 'object') continue

      const entry = item as ComposerHeaderEntry
      const workspaceHash = toText(entry.workspaceIdentifier?.id)
      const composerId = toText(entry.composerId)
      if (!workspaceHash || !composerId) continue

      const title = toText(entry.name) ?? getFallbackComposerTitle(composerId)
      const summary = toText(entry.subtitle)
      const updatedAt = toIsoDate(entry.conversationCheckpointLastUpdatedAt ?? entry.lastUpdatedAt ?? entry.createdAt)

      const workspaceEntries = metadataByWorkspace.get(workspaceHash) ?? new Map<string, ComposerRecord>()
      workspaceEntries.set(composerId, {
        composerId,
        title,
        summary,
        updatedAt,
      })
      metadataByWorkspace.set(workspaceHash, workspaceEntries)
    }

    return metadataByWorkspace
  } catch (error) {
    logger.error('Global composer metadata read failed:', {
      dbPath: globalStorageDbPath,
      error: error instanceof Error ? error.message : String(error),
    })

    return new Map()
  }
}

function mergeComposerRecords(
  workspaceHash: string,
  paneRecords: ComposerRecord[],
  metadataIndex: Map<string, Map<string, ComposerRecord>>
): ComposerRecord[] {
  const metadataByComposerId = metadataIndex.get(workspaceHash)
  const merged = new Map<string, ComposerRecord>()

  for (const record of paneRecords) {
    const metadata = metadataByComposerId?.get(record.composerId)
    merged.set(record.composerId, metadata ?? record)
  }

  return [...merged.values()]
}

function buildTranscriptSummary(projectPath: string, composer: ComposerRecord): TranscriptSummary {
  const transcriptPath = resolveTranscriptFilePath(projectPath, composer.composerId)
  const hasContent = fs.existsSync(transcriptPath)
  const title =
    !isFallbackComposerTitle(composer.title, composer.composerId) || !hasContent
      ? composer.title
      : deriveTitleFromTranscript(transcriptPath, composer.composerId)

  return {
    id: `composer:${composer.composerId}`,
    sourceKey: composer.composerId,
    title,
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

export function scanWorkspace(
  hash: string,
  composerMetadataIndex: Map<string, Map<string, ComposerRecord>> = new Map()
): WorkspaceScanEntry {
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
      mergeComposerRecords(hash, readComposerRecords(db), composerMetadataIndex).map((composer) =>
        buildTranscriptSummary(projectPath, composer)
      )
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

  const composerMetadataIndex = readComposerMetadataIndex()
  const entries = hashes.map((hash) => scanWorkspace(hash, composerMetadataIndex))
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
