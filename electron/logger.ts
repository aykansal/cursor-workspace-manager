import { createRequire } from 'module'

type LoggerLike = {
  debug: (...args: unknown[]) => void
  info: (...args: unknown[]) => void
  warn: (...args: unknown[]) => void
  error: (...args: unknown[]) => void
}

const debugEnabled = process.env.CURSOR_WORKSPACE_MANAGER_DEBUG === '1'
const require = createRequire(import.meta.url)

function createConsoleLogger(scope: string): LoggerLike {
  const prefix = `(${scope})`

  return {
    debug: (...args) => {
      if (debugEnabled) {
        console.debug(prefix, ...args)
      }
    },
    info: (...args) => {
      console.info(prefix, ...args)
    },
    warn: (...args) => {
      console.warn(prefix, ...args)
    },
    error: (...args) => {
      console.error(prefix, ...args)
    },
  }
}

function createLogger(scope: string): LoggerLike {
  if (process.env.ELECTRON_RUN_AS_NODE === '1') {
    try {
      const log = require('electron-log/node') as typeof import('electron-log')
      log.transports.console.level = debugEnabled ? 'debug' : 'warn'
      log.transports.file.level = debugEnabled ? 'debug' : 'warn'
      log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {scope}: {text}'
      return log.scope(scope)
    } catch {
      return createConsoleLogger(scope)
    }
  }

  try {
    const log = require('electron-log/main') as typeof import('electron-log/main')
    log.transports.console.level = debugEnabled ? 'debug' : false
    log.transports.file.level = debugEnabled ? 'debug' : 'warn'
    log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {scope}: {text}'
    return log.scope(scope)
  } catch {
    return createConsoleLogger(scope)
  }
}

export const logger = createLogger('main')
export const isDebugLoggingEnabled = debugEnabled
