import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'
import fs from 'fs'
import os from 'os'
import { is } from '@electron-toolkit/utils'
import { logger } from './logger'

let mainWindow: BrowserWindow | null = null
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const require = createRequire(import.meta.url)
const Database = require('better-sqlite3') as typeof import('better-sqlite3')

type ChatEntry = {
  key: string
  preview: string
}

type WorkspaceTranscript = {
  id: string
  sourceKey: string
  title: string
  summary: string | null
  content: string
  transcriptPath: string
  updatedAt: string | null
}

function toIsoDate(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const normalized = value < 10_000_000_000 ? value * 1000 : value
    const date = new Date(normalized)
    return Number.isNaN(date.getTime()) ? null : date.toISOString()
  }

  if (typeof value === 'string') {
    const asNumber = Number(value)
    if (!Number.isNaN(asNumber)) return toIsoDate(asNumber)

    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? null : date.toISOString()
  }

  return null
}

function toText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function toCursorProjectSlug(projectPath: string): string {
  return projectPath
    .replace(/\\/g, '/')
    .replace(/^([a-zA-Z]):/, (_, drive: string) => drive.toLowerCase())
    .split('/')
    .filter(Boolean)
    .map((segment) => segment.replace(/[^a-zA-Z0-9.-]+/g, '-').replace(/-+/g, '-'))
    .join('-')
}

function getWslRemoteInfo(projectPath: string): { distro: string; linuxPath: string } | null {
  if (projectPath.startsWith('vscode-remote://wsl+')) {
    const match = projectPath.match(/^vscode-remote:\/\/wsl\+([^/]+)(\/.*)$/)
    if (!match) return null

    return {
      distro: decodeURIComponent(match[1]),
      linuxPath: match[2],
    }
  }

  if (projectPath.startsWith('file://wsl.localhost/')) {
    const match = projectPath.match(/^file:\/\/wsl\.localhost\/([^/]+)(\/.*)$/)
    if (!match) return null

    return {
      distro: decodeURIComponent(match[1]),
      linuxPath: match[2],
    }
  }

  return null
}

function getCursorProjectRoots(projectPath: string): string[] {
  const roots = [path.join(os.homedir(), '.cursor', 'projects')]
  const wslInfo = getWslRemoteInfo(projectPath)

  if (wslInfo) {
    const segments = wslInfo.linuxPath.split('/').filter(Boolean)
    if (segments[0] === 'home' && segments[1]) {
      roots.unshift(
        path.win32.join(
          `\\\\wsl.localhost\\${wslInfo.distro}`,
          'home',
          segments[1],
          '.cursor',
          'projects'
        )
      )
    }
  }

  return [...new Set(roots)]
}

function getTranscriptFilePath(projectPath: string, composerId: string): string {
  const normalizedProjectPath = getWslRemoteInfo(projectPath)?.linuxPath ?? projectPath

  return path.join(
    getCursorProjectRoots(projectPath)[0],
    toCursorProjectSlug(normalizedProjectPath),
    'agent-transcripts',
    composerId,
    `${composerId}.jsonl`
  )
}

function resolveTranscriptFilePath(projectPath: string, composerId: string): string {
  const directPath = getTranscriptFilePath(projectPath, composerId)
  if (fs.existsSync(directPath)) return directPath

  for (const projectsRoot of getCursorProjectRoots(projectPath)) {
    if (!fs.existsSync(projectsRoot)) continue

    for (const projectDir of fs.readdirSync(projectsRoot)) {
      const candidate = path.join(
        projectsRoot,
        projectDir,
        'agent-transcripts',
        composerId,
        `${composerId}.jsonl`
      )

      if (fs.existsSync(candidate)) {
        return candidate
      }
    }
  }

  return directPath
}

function extractTextContent(value: unknown): string[] {
  if (!value) return []

  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed ? [trimmed] : []
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry) => extractTextContent(entry))
  }

  if (typeof value !== 'object') return []

  const record = value as Record<string, unknown>

  if (record.type === 'text' && typeof record.text === 'string') {
    return record.text.trim() ? [record.text.trim()] : []
  }

  if ('content' in record) {
    return extractTextContent(record.content)
  }

  if ('text' in record && typeof record.text === 'string') {
    return record.text.trim() ? [record.text.trim()] : []
  }

  return []
}

function readAgentTranscript(transcriptPath: string): string {
  if (!fs.existsSync(transcriptPath)) return ''

  return fs
    .readFileSync(transcriptPath, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      try {
        const parsed = JSON.parse(line) as Record<string, unknown>
        const role = toText(parsed.role) ?? 'assistant'
        const text = extractTextContent(parsed.message)
          .join('\n')
          .replace(/\[REDACTED\]/gi, '')
          .trim()
        if (!text) return []

        const speaker =
          role === 'user' ? 'User' : role === 'assistant' ? 'Assistant' : role[0].toUpperCase() + role.slice(1)

        return [`${speaker}: ${text}`]
      } catch {
        return []
      }
    })
    .join('\n\n')
}

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

function extractComposerRecords(rawValue?: string, projectPath?: string): ComposerRecord[] {
  if (!rawValue) return []

  try {
    const parsed = JSON.parse(rawValue) as {
      allComposers?: Array<Record<string, unknown>>
    }

    if (!Array.isArray(parsed.allComposers)) return []

    return parsed.allComposers
      .filter((composer) => composer && typeof composer === 'object')
      .map((composer, index) => {
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
          (unifiedMode ? `${unifiedMode[0].toUpperCase()}${unifiedMode.slice(1)} session ${index + 1}` : `Session ${index + 1}`)

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
      .filter((composer): composer is ComposerRecord => Boolean(composer))
  } catch {
    return []
  }
}

function readComposerData(db: InstanceType<typeof Database>): ComposerData {
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

function writeComposerData(db: InstanceType<typeof Database>, composerData: ComposerData) {
  db.prepare('INSERT OR REPLACE INTO ItemTable (key, value) VALUES (?, ?)').run(
    'composer.composerData',
    JSON.stringify(composerData)
  )
}

function getWorkspaceChats(db: InstanceType<typeof Database>, projectPath: string): ChatEntry[] {
  const row = db
    .prepare(`SELECT value FROM ItemTable WHERE key = 'composer.composerData'`)
    .get() as { value?: string } | undefined

  return extractComposerRecords(row?.value, projectPath).map((composer) => ({
    key: composer.composerId,
    preview: composer.title,
  }))
}

function getWorkspaceTranscripts(db: InstanceType<typeof Database>, projectPath: string): WorkspaceTranscript[] {
  const composerRow = db
    .prepare(`SELECT value FROM ItemTable WHERE key = 'composer.composerData'`)
    .get() as { value?: string } | undefined
  const composerRecords = extractComposerRecords(composerRow?.value, projectPath)

  const transcripts = composerRecords.map((composer) => {
    const transcriptPath = resolveTranscriptFilePath(projectPath, composer.composerId)
    const transcriptBody = readAgentTranscript(transcriptPath)

    return {
      id: `composer:${composer.composerId}`,
      sourceKey: composer.composerId,
      title: composer.title,
      summary: composer.summary,
      content: transcriptBody || `Transcript file not found at ${transcriptPath}`,
      transcriptPath,
      updatedAt: composer.updatedAt,
    } satisfies WorkspaceTranscript
  })

  transcripts.sort((a, b) => {
    const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0
    const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0
    return bTime - aTime
  })

  return transcripts
}

function getWorkspaceInfo(hash: string) {
  const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming')
  const workspaceDir = path.join(appData, 'Cursor', 'User', 'workspaceStorage', hash)
  const dbPath = path.join(workspaceDir, 'state.vscdb')
  const workspaceJsonPath = path.join(workspaceDir, 'workspace.json')

  let projectPath = 'Unknown'

  if (fs.existsSync(workspaceJsonPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(workspaceJsonPath, 'utf8')) as { folder?: string }
      projectPath = data.folder
        ? decodeURIComponent(data.folder.replace('file:///', ''))
        : 'Multi-folder workspace'
    } catch {}
  }

  return {
    dbPath,
    projectPath,
    workspaceDir,
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      sandbox: true,
      contextIsolation: true
    }
  })

  const isDev = is.dev
  // const isDev = !app.isPackaged

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(createWindow)

// IPC Handlers (unchanged - your Cursor logic)
ipcMain.handle('get-workspaces', async () => {
  const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming')
  const wsDir = path.join(appData, 'Cursor', 'User', 'workspaceStorage')
  logger.debug('Scanning workspace storage:', wsDir)
  if (!fs.existsSync(wsDir)) {
    logger.warn('Workspace storage directory does not exist:', wsDir)
    return []
  }

  const workspaces: any[] = []
  const folders = fs.readdirSync(wsDir).filter(f => f.length === 32)
  logger.debug('Found workspace folder count:', folders.length)

  for (const hash of folders) {
    const folderPath = path.join(wsDir, hash)
    const dbPath = path.join(folderPath, 'state.vscdb')
    const jsonPath = path.join(folderPath, 'workspace.json')

    let projectPath = 'Unknown'
    if (fs.existsSync(jsonPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'))
        projectPath = data.folder
          ? decodeURIComponent(data.folder.replace('file:///', ''))
          : 'Multi-folder workspace'
      } catch {}
    }

    let chatCount = 0
    let chatPreviews: string[] = []
    let lastModified: string | null = null
    if (fs.existsSync(dbPath)) {
      lastModified = fs.statSync(dbPath).mtime.toISOString()
      try {
        logger.debug('Opening workspace DB:', { hash, dbPath })
        const db = new Database(dbPath, { readonly: true })
        const chats = getWorkspaceChats(db, projectPath)

        chatPreviews = chats.map((chat) => chat.preview)
        chatCount = chatPreviews.length

        logger.debug('Workspace scan result:', {
          hash,
          chatCount,
          chatPreviewSample: chatPreviews.slice(0, 5),
        })

        db.close()
      } catch (error) {
        logger.error('Workspace database read failed:', {
          hash,
          dbPath,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    } else {
      logger.warn('Workspace missing state.vscdb:', { hash, dbPath })
    }

    logger.debug('Workspace final result:', { hash, projectPath, chatCount })

    workspaces.push({ hash, projectPath, chatCount, chatPreviews, lastModified, dbPath })
  }
  return workspaces.sort((a, b) => new Date(b.lastModified!).getTime() - new Date(a.lastModified!).getTime())
})

ipcMain.handle('get-workspace-transcripts', async (_, workspace: { dbPath: string; projectPath: string }) => {
  try {
    const db = new Database(workspace.dbPath, { readonly: true })
    const transcripts = getWorkspaceTranscripts(db, workspace.projectPath)
    db.close()
    return transcripts
  } catch (error) {
    logger.error('Workspace transcript extraction failed:', {
      dbPath: workspace.dbPath,
      projectPath: workspace.projectPath,
      error: error instanceof Error ? error.message : String(error),
    })
    return []
  }
})

ipcMain.handle('transfer-chats', async (_, { sourceHash, targetHash, composerId }) => {
  const sourceWorkspace = getWorkspaceInfo(sourceHash)
  const targetWorkspace = getWorkspaceInfo(targetHash)

  const backupDir = path.join(os.homedir(), 'Desktop', 'Cursor-Backups')
  fs.mkdirSync(backupDir, { recursive: true })
  fs.copyFileSync(sourceWorkspace.dbPath, path.join(backupDir, `backup-${sourceHash}-${Date.now()}.vscdb`))
  fs.copyFileSync(targetWorkspace.dbPath, path.join(backupDir, `backup-${targetHash}-${Date.now()}.vscdb`))

  try {
    const sourceDb = new Database(sourceWorkspace.dbPath)
    const targetDb = new Database(targetWorkspace.dbPath)

    const sourceComposerData = readComposerData(sourceDb)
    const targetComposerData = readComposerData(targetDb)

    const sourceComposer = (sourceComposerData.allComposers ?? []).find((composer) => {
      if (!composer || typeof composer !== 'object') return false
      return toText((composer as Record<string, unknown>).composerId) === composerId
    })

    if (!sourceComposer) {
      sourceDb.close()
      targetDb.close()
      return { success: false, error: `Selected chat ${composerId} was not found in the source workspace.` }
    }

    const targetHasComposer = (targetComposerData.allComposers ?? []).some((composer) => {
      if (!composer || typeof composer !== 'object') return false
      return toText((composer as Record<string, unknown>).composerId) === composerId
    })

    if (targetHasComposer) {
      sourceDb.close()
      targetDb.close()
      return { success: true, message: 'Chat already exists in the target workspace. Skipped.' }
    }

    const sourceTranscriptFile = resolveTranscriptFilePath(sourceWorkspace.projectPath, composerId)
    const sourceTranscriptDir = path.dirname(sourceTranscriptFile)

    if (!fs.existsSync(sourceTranscriptFile)) {
      sourceDb.close()
      targetDb.close()
      return {
        success: false,
        error: `Transcript file missing for selected chat at ${sourceTranscriptFile}`,
      }
    }

    const targetTranscriptFile = getTranscriptFilePath(targetWorkspace.projectPath, composerId)
    const targetTranscriptDir = path.dirname(targetTranscriptFile)

    if (fs.existsSync(targetTranscriptDir)) {
      sourceDb.close()
      targetDb.close()
      return { success: true, message: 'Chat already exists in the target workspace. Skipped.' }
    }

    fs.mkdirSync(path.dirname(targetTranscriptDir), { recursive: true })
    fs.cpSync(sourceTranscriptDir, targetTranscriptDir, { recursive: true, force: false, errorOnExist: true })

    try {
      const nextComposerData: ComposerData = {
        ...targetComposerData,
        allComposers: [...(targetComposerData.allComposers ?? []), sourceComposer as Record<string, unknown>],
      }

      const transaction = targetDb.transaction(() => {
        writeComposerData(targetDb, nextComposerData)
      })

      transaction()
    } catch (error) {
      fs.rmSync(targetTranscriptDir, { recursive: true, force: true })
      throw error
    }

    sourceDb.close()
    targetDb.close()
    return { success: true, message: 'Chat copied to the target workspace.' }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('get-chat-preview', async (_, dbPath) => {
  try {
    const db = new Database(dbPath, { readonly: true })
    const rows = getWorkspaceChats(db)
    db.close()
    return rows
  } catch {
    return []
  }
})
