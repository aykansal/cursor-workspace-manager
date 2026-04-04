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

function getChatPreviewFromValue(rawValue?: string): string {
  if (!rawValue) return 'No preview'

  try {
    const parsed = JSON.parse(rawValue) as {
      tabs?: Array<{ title?: string }>
      allComposers?: Array<{ name?: string }>
    }

    if (Array.isArray(parsed.tabs) && parsed.tabs.length > 0) {
      return parsed.tabs[0].title ?? 'Chat'
    }

    if (Array.isArray(parsed.allComposers) && parsed.allComposers.length > 0) {
      return parsed.allComposers[0].name ?? 'Chat'
    }
  } catch (error) {
    // debugLog('Failed to parse chat value JSON for preview:', error)
  }

  return 'Chat'
}

function collectChatEntries(value: unknown, fallbackLabel = 'Chat'): string[] {
  if (!value || typeof value !== 'object') return []

  const entries: string[] = []
  const seen = new Set<string>()

  const addEntry = (raw: unknown) => {
    if (!raw || typeof raw !== 'string') return

    const trimmed = raw.trim()
    if (!trimmed) return

    const normalized = trimmed.toLowerCase()
    if (seen.has(normalized)) return

    seen.add(normalized)
    entries.push(trimmed)
  }

  const addFromItems = (items: unknown, fields: string[]) => {
    if (!Array.isArray(items)) return false

    let added = false
    for (const item of items) {
      if (!item || typeof item !== 'object') continue

      for (const field of fields) {
        const candidate = (item as Record<string, unknown>)[field]
        if (typeof candidate === 'string' && candidate.trim()) {
          addEntry(candidate)
          added = true
          break
        }
      }
    }

    return added
  }

  const record = value as Record<string, unknown>

  addFromItems(record.tabs, ['title', 'name', 'id'])
  addFromItems(record.allComposers, ['name', 'title', 'id'])
  addFromItems(record.composers, ['name', 'title', 'id'])
  addFromItems(record.chatSessions, ['title', 'name', 'id'])
  addFromItems(record.sessions, ['title', 'name', 'id'])

  addEntry(record.title)
  addEntry(record.name)

  if (entries.length === 0 && fallbackLabel.trim()) {
    entries.push(fallbackLabel)
  }

  return entries
}

function getWorkspaceChats(db: InstanceType<typeof Database>): ChatEntry[] {
  const rows = db
    .prepare(
      `SELECT key, value
       FROM ItemTable
       WHERE key IN ('composer.composerData', 'workbench.panel.aichat.view.aichat.chatdata')
          OR key LIKE 'workbench.panel.composerChatViewPane.%'
          OR key LIKE '%chat%'
          OR key LIKE '%composer%'`
    )
    .all() as Array<{ key: string; value?: string }>

  const chats: ChatEntry[] = []
  const seen = new Set<string>()

  for (const row of rows) {
    if (!row.key) continue

    let previews: string[] = []

    if (row.value) {
      try {
        const parsed = JSON.parse(row.value) as unknown
        previews = collectChatEntries(parsed, getChatPreviewFromValue(row.value))
      } catch {
        previews = []
      }
    }

    if (previews.length === 0 && row.key.startsWith('workbench.panel.composerChatViewPane.')) {
      previews = ['Chat']
    }

    for (const preview of previews) {
      const signature = `${row.key}::${preview.toLowerCase()}`
      if (seen.has(signature)) continue

      seen.add(signature)
      chats.push({ key: row.key, preview })
    }
  }

  return chats
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
