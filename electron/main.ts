import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'
import fs from 'fs'
import os from 'os'
import { is } from '@electron-toolkit/utils'

let mainWindow: BrowserWindow | null = null
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const CHAT_DEBUG_PREFIX = '[CursorChatDebug]'
const require = createRequire(import.meta.url)
const Database = require('better-sqlite3') as typeof import('better-sqlite3')

function debugLog(...args: unknown[]) {
  console.log(CHAT_DEBUG_PREFIX, ...args)
}

function getChatCountFromValue(rawValue?: string): number {
  if (!rawValue) return 0

  try {
    const parsed = JSON.parse(rawValue) as {
      allComposers?: unknown[]
      tabs?: unknown[]
      composers?: unknown[]
    }

    if (Array.isArray(parsed.allComposers)) return parsed.allComposers.length
    if (Array.isArray(parsed.tabs)) return parsed.tabs.length
    if (Array.isArray(parsed.composers)) return parsed.composers.length
  } catch (error) {
    // debugLog('Failed to parse chat value JSON for count:', error)
  }

  return 0
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
  // debugLog('Scanning workspace storage:', wsDir)
  if (!fs.existsSync(wsDir)) {
    // debugLog('Workspace storage directory does not exist')
    return []
  }

  const workspaces: any[] = []
  const folders = fs.readdirSync(wsDir).filter(f => f.length === 32)
  // debugLog('Found workspace folder count:', folders.length)

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
    let lastModified: string | null = null
    if (fs.existsSync(dbPath)) {
      lastModified = fs.statSync(dbPath).mtime.toISOString()
      try {
        const db = new Database(dbPath, { readonly: true })
        const row = db
          .prepare(`SELECT key, value FROM ItemTable WHERE key IN ('composer.composerData', 'workbench.panel.aichat.view.aichat.chatdata') LIMIT 1`)
          .get() as { key?: string; value?: string } | undefined

        // debugLog('Workspace', hash, 'primary row key:', row?.key ?? 'none')
        chatCount = getChatCountFromValue(row?.value)
        // debugLog('Workspace', hash, 'count from primary row:', chatCount)

        if (chatCount === 0) {
          const paneCount = db.prepare("SELECT COUNT(*) as count FROM ItemTable WHERE key LIKE 'workbench.panel.composerChatViewPane.%'").get() as { count?: number } | undefined
          chatCount = paneCount?.count ?? 0
          // debugLog('Workspace', hash, 'fallback pane count:', chatCount)

          if (chatCount === 0) {
            const keySamples = db
              .prepare("SELECT key FROM ItemTable WHERE key LIKE '%chat%' OR key LIKE '%composer%' ORDER BY key LIMIT 10")
              .all() as { key: string }[]
            // debugLog('Workspace', hash, 'chat/composer key samples:', keySamples.map(k => k.key))
          }
        }

        db.close()
      } catch (error) {
        // debugLog('Workspace', hash, 'database read failed:', error)
      }
    } else {
      // debugLog('Workspace', hash, 'missing state.vscdb at', dbPath)
    }

    // debugLog('Workspace', hash, 'final chatCount:', chatCount, 'projectPath:', projectPath)

    workspaces.push({ hash, projectPath, chatCount, lastModified, dbPath })
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
    const rows = db.prepare("SELECT key, value FROM ItemTable WHERE key = 'composer.composerData' OR key = 'workbench.panel.aichat.view.aichat.chatdata'").all() as { key: string; value?: string }[]
    db.close()
    return rows.map(r => ({
      key: r.key,
      preview: getChatPreviewFromValue(r.value)
    }))
  } catch {
    return []
  }
})