import log from 'electron-log/main'
// import { app } from 'electron'

const debugEnabled =
  process.env.CURSOR_WORKSPACE_MANAGER_DEBUG === '1' 
  // !app.isPackaged

log.transports.console.level = debugEnabled ? 'debug' : false
log.transports.file.level = debugEnabled ? 'debug' : 'warn'
log.transports.file.format =
  '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {scope}: {text}'

export const logger = log.scope('main')
export const isDebugLoggingEnabled = debugEnabled
