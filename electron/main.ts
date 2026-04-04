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

type ComposerRecord = {
  composerId: string
  title: string
  summary: string | null
  updatedAt: string | null
  isSelected: boolean
  detailLines: string[]
}

function extractPromptLines(rawValue?: string): string[] {
  if (!rawValue) return []

  try {
    const parsed = JSON.parse(rawValue) as Array<Record<string, unknown>>
    if (!Array.isArray(parsed)) return []

    return parsed
      .map((entry) => toText(entry.text))
      .filter((entry): entry is string => Boolean(entry))
      .map((entry) => `User: ${entry}`)
  } catch {
    return []
  }
}

function extractGenerationLines(rawValue?: string): string[] {
  if (!rawValue) return []

  try {
    const parsed = JSON.parse(rawValue) as Array<Record<string, unknown>>
    if (!Array.isArray(parsed)) return []

    return parsed
      .map((entry) => toText(entry.textDescription))
      .filter((entry): entry is string => Boolean(entry))
      .map((entry) => `Assistant: ${entry}`)
  } catch {
    return []
  }
}

function extractComposerRecords(rawValue?: string): ComposerRecord[] {
  if (!rawValue) return []

  try {
    const parsed = JSON.parse(rawValue) as {
      allComposers?: Array<Record<string, unknown>>
      selectedComposerIds?: string[]
      lastFocusedComposerIds?: string[]
    }

    if (!Array.isArray(parsed.allComposers)) return []

    const selectedIds = new Set(
      [...(parsed.selectedComposerIds ?? []), ...(parsed.lastFocusedComposerIds ?? [])].filter(Boolean)
    )

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
        const createdAt = toIsoDate(composer.createdAt ?? null)

        const title =
          name ??
          subtitle ??
          (unifiedMode ? `${unifiedMode[0].toUpperCase()}${unifiedMode.slice(1)} session ${index + 1}` : `Session ${index + 1}`)

        const detailLines = [
          subtitle,
          modeLabel ? `Mode: ${modeLabel}` : null,
          filesChanged,
          contextUsage,
          createdAt ? `Created: ${new Date(createdAt).toLocaleString()}` : null,
        ].filter((entry): entry is string => Boolean(entry))

        return {
          composerId,
          title,
          summary: subtitle ?? modeLabel ?? filesChanged ?? contextUsage ?? null,
          updatedAt: toIsoDate(composer.lastUpdatedAt ?? composer.updatedAt ?? composer.createdAt ?? null),
          isSelected: selectedIds.has(composerId),
          detailLines,
        } satisfies ComposerRecord
      })
  } catch {
    return []
  }
}

function getWorkspaceChats(db: InstanceType<typeof Database>): ChatEntry[] {
  const row = db
    .prepare(`SELECT value FROM ItemTable WHERE key = 'composer.composerData'`)
    .get() as { value?: string } | undefined

  return extractComposerRecords(row?.value).map((composer) => ({
    key: composer.composerId,
    preview: composer.title,
  }))
}

function getWorkspaceTranscripts(db: InstanceType<typeof Database>): WorkspaceTranscript[] {
  const composerRow = db
    .prepare(`SELECT value FROM ItemTable WHERE key = 'composer.composerData'`)
    .get() as { value?: string } | undefined
  const promptRow = db
    .prepare(`SELECT value FROM ItemTable WHERE key = 'aiService.prompts'`)
    .get() as { value?: string } | undefined
  const generationRow = db
    .prepare(`SELECT value FROM ItemTable WHERE key = 'aiService.generations'`)
    .get() as { value?: string } | undefined

  const promptLines = extractPromptLines(promptRow?.value)
  const generationLines = extractGenerationLines(generationRow?.value)
  const composerRecords = extractComposerRecords(composerRow?.value)

  const transcripts = composerRecords.map((composer) => {
    const relatedLines = composer.isSelected ? [...promptLines, ...generationLines] : []
    const content = [...composer.detailLines, ...relatedLines].join('\n\n')

    return {
      id: `composer:${composer.composerId}`,
      sourceKey: 'composer.composerData',
      title: composer.title,
      summary: composer.summary,
      content: content || composer.summary || composer.title,
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
        const chats = getWorkspaceChats(db)

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

ipcMain.handle('get-workspace-transcripts', async (_, dbPath: string) => {
  try {
    const db = new Database(dbPath, { readonly: true })
    const transcripts = getWorkspaceTranscripts(db)
    db.close()
    return transcripts
  } catch (error) {
    logger.error('Workspace transcript extraction failed:', {
      dbPath,
      error: error instanceof Error ? error.message : String(error),
    })
    return []
  }
})

ipcMain.handle('transfer-chats', async (_, { sourceHash, targetHash }) => {
  const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming')
  const wsDir = path.join(appData, 'Cursor', 'User', 'workspaceStorage')

  const sourceDbPath = path.join(wsDir, sourceHash, 'state.vscdb')
  const targetDbPath = path.join(wsDir, targetHash, 'state.vscdb')

  const backupDir = path.join(os.homedir(), 'Desktop', 'Cursor-Backups')
  fs.mkdirSync(backupDir, { recursive: true })
  fs.copyFileSync(sourceDbPath, path.join(backupDir, `backup-${sourceHash}-${Date.now()}.vscdb`))
  fs.copyFileSync(targetDbPath, path.join(backupDir, `backup-${targetHash}-${Date.now()}.vscdb`))

  try {
    const sourceDb = new Database(sourceDbPath)
    const targetDb = new Database(targetDbPath)

    const keys = ['composer.composerData', 'workbench.panel.aichat.view.aichat.chatdata']

    for (const key of keys) {
      const row = sourceDb.prepare('SELECT value FROM ItemTable WHERE key = ?').get(key) as { value?: string } | undefined
      if (row?.value) {
        targetDb.prepare('INSERT OR REPLACE INTO ItemTable (key, value) VALUES (?, ?)').run(key, row.value)
      }
    }

    sourceDb.close()
    targetDb.close()
    return { success: true, message: '✅ Chats transferred! Open the target project in Cursor.' }
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
