import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import { is } from '@electron-toolkit/utils'
import { WORKSPACE_SCAN_STATE_EVENT, type TransferPayload } from './contracts'
import { logger } from './logger'
import { WorkspaceServiceClient } from './service-client'

let mainWindow: BrowserWindow | null = null
let serviceClient: WorkspaceServiceClient | null = null

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function getServiceClient(): WorkspaceServiceClient {
  if (!serviceClient) {
    serviceClient = new WorkspaceServiceClient()
    serviceClient.on('scanState', (state) => {
      mainWindow?.webContents.send(WORKSPACE_SCAN_STATE_EVENT, state)
    })
    serviceClient.start()
  }

  return serviceClient
}

function registerIpcHandlers() {
  ipcMain.handle('workspace:list', () => getServiceClient().request('listWorkspaces', undefined))
  ipcMain.handle('workspace:refresh', () => getServiceClient().request('refreshWorkspaces', undefined))
  ipcMain.handle('workspace:scan-state', () => getServiceClient().request('getWorkspaceScanState', undefined))
  ipcMain.handle('workspace:transcripts', (_event, workspaceHash: string) =>
    getServiceClient().request('listWorkspaceTranscripts', { workspaceHash })
  )
  ipcMain.handle(
    'workspace:transcript-detail',
    (_event, payload: { workspaceHash: string; transcriptId: string }) =>
      getServiceClient().request('getTranscriptDetail', payload)
  )
  ipcMain.handle('workspace:transfer', (_event, payload: TransferPayload) =>
    getServiceClient().request('transferTranscript', payload)
  )
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      sandbox: true,
      contextIsolation: true,
    },
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    logger.error('Renderer failed to load:', { errorCode, errorDescription })
  })

  if (is.dev) {
    void mainWindow.loadURL('http://localhost:5173')
    if (process.env.OPEN_DEVTOOLS === '1') {
      mainWindow.webContents.openDevTools()
    }
    return
  }

  void mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
}

app.whenReady().then(() => {
  registerIpcHandlers()
  getServiceClient()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('before-quit', () => {
  serviceClient?.stop()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
