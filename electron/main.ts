import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import Database from 'better-sqlite3'
import fs from 'fs'
import os from 'os'
import { is } from '@electron-toolkit/utils'

let mainWindow: BrowserWindow | null = null
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

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
  if (!fs.existsSync(wsDir)) return []

  const workspaces: any[] = []
  const folders = fs.readdirSync(wsDir).filter(f => f.length === 32)

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
        const row = db.prepare(`SELECT value FROM ItemTable WHERE key LIKE '%composerData%' OR key LIKE '%chatdata%' LIMIT 1`).get() as { value?: string } | undefined
        if (row?.value) chatCount = JSON.parse(row.value).tabs?.length ?? 1
        db.close()
      } catch {}
    }

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
    const rows = db.prepare("SELECT key, value FROM ItemTable WHERE key LIKE '%chatdata%' OR key = 'composer.composerData'").all() as { key: string; value?: string }[]
    db.close()
    return rows.map(r => ({
      key: r.key,
      preview: r.value ? JSON.parse(r.value).tabs?.[0]?.title ?? 'Chat' : 'No preview'
    }))
  } catch {
    return []
  }
})