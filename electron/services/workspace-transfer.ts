import fs from 'fs'
import os from 'os'
import path from 'path'
import type DatabaseType from 'better-sqlite3'
import type { TransferPayload, TransferResult } from '../contracts'
import { logger } from '../logger'
import {
  getTranscriptFilePath,
  getWorkspaceDbPath,
  getWorkspaceProjectPath,
  resolveTranscriptFilePath,
} from './cursor-paths'
import { Database } from './sqlite'

function getBackupDir(): string {
  return path.join(os.homedir(), 'Desktop', 'Cursor-Backups')
}

function ensureBackups(sourceDbPath: string, targetDbPath: string) {
  const backupDir = getBackupDir()
  fs.mkdirSync(backupDir, { recursive: true })
  const timestamp = Date.now()

  fs.copyFileSync(sourceDbPath, path.join(backupDir, `backup-source-${timestamp}.vscdb`))
  fs.copyFileSync(targetDbPath, path.join(backupDir, `backup-target-${timestamp}.vscdb`))
}

function closeQuietly(db: DatabaseType.Database | null) {
  if (!db) return

  try {
    db.close()
  } catch {
    // ignore close errors during cleanup
  }
}

function collectComposerIds(db: DatabaseType.Database): string[] {
  const rows = db
    .prepare("SELECT value FROM ItemTable WHERE key LIKE 'workbench.panel.composerChatViewPane.%'")
    .all() as Array<{ value?: string }>

  const ids = new Set<string>()

  for (const row of rows) {
    if (!row.value) continue

    try {
      const parsed = JSON.parse(row.value) as Record<string, unknown>
      for (const key of Object.keys(parsed)) {
        const prefix = 'workbench.panel.aichat.view.'
        if (key.startsWith(prefix)) {
          ids.add(key.slice(prefix.length))
        }
      }
    } catch {
      // ignore malformed pane state
    }
  }

  return [...ids]
}

function upsertComposerPaneState(db: DatabaseType.Database, composerId: string) {
  const paneState = {
    [`workbench.panel.aichat.view.${composerId}`]: {
      collapsed: false,
      isHidden: false,
      size: 940,
    },
  }

  db.prepare('INSERT OR REPLACE INTO ItemTable (key, value) VALUES (?, ?)').run(
    `workbench.panel.composerChatViewPane.${composerId}`,
    JSON.stringify(paneState)
  )
}

export function transferTranscript(payload: TransferPayload): TransferResult {
  if (payload.sourceHash === payload.targetHash) {
    return {
      success: false,
      error: 'Source and target workspaces must be different.',
    }
  }

  const sourceDbPath = getWorkspaceDbPath(payload.sourceHash)
  const targetDbPath = getWorkspaceDbPath(payload.targetHash)
  const sourceProjectPath = getWorkspaceProjectPath(payload.sourceHash)
  const targetProjectPath = getWorkspaceProjectPath(payload.targetHash)

  if (!fs.existsSync(sourceDbPath) || !fs.existsSync(targetDbPath)) {
    return {
      success: false,
      error: 'Source or target workspace database is missing.',
    }
  }

  try {
    ensureBackups(sourceDbPath, targetDbPath)
  } catch (error) {
    return {
      success: false,
      error: `Backup failed: ${error instanceof Error ? error.message : String(error)}`,
    }
  }

  let sourceDb: DatabaseType.Database | null = null
  let targetDb: DatabaseType.Database | null = null

  try {
    sourceDb = new Database(sourceDbPath)
    targetDb = new Database(targetDbPath)

    const sourceComposerIds = collectComposerIds(sourceDb)
    if (!sourceComposerIds.includes(payload.composerId)) {
      return {
        success: false,
        error: `Selected chat ${payload.composerId} was not found in the source workspace pane state.`,
      }
    }

    const targetComposerIds = collectComposerIds(targetDb)
    if (targetComposerIds.includes(payload.composerId)) {
      return {
        success: true,
        message: 'Chat already exists in the target workspace. Skipped.',
      }
    }

    const sourceTranscriptFile = resolveTranscriptFilePath(sourceProjectPath, payload.composerId)

    const sourceTranscriptDir = path.dirname(sourceTranscriptFile)
    if (!fs.existsSync(sourceTranscriptFile)) {
      return {
        success: false,
        error: `Transcript file missing for selected chat at ${sourceTranscriptFile}`,
      }
    }

    const targetTranscriptFile = getTranscriptFilePath(targetProjectPath, payload.composerId)
    const targetTranscriptDir = path.dirname(targetTranscriptFile)

    if (fs.existsSync(targetTranscriptDir)) {
      return {
        success: true,
        message: 'Chat already exists in the target workspace. Skipped.',
      }
    }

    fs.mkdirSync(path.dirname(targetTranscriptDir), { recursive: true })
    fs.cpSync(sourceTranscriptDir, targetTranscriptDir, { recursive: true, force: false, errorOnExist: true })

    try {
      const transaction = targetDb.transaction(() => {
        upsertComposerPaneState(targetDb!, payload.composerId)
      })

      transaction()
    } catch (error) {
      fs.rmSync(targetTranscriptDir, { recursive: true, force: true })
      throw error
    }

    return {
      success: true,
      message: 'Chat copied to the target workspace.',
    }
  } catch (error) {
    logger.error('Transcript transfer failed:', {
      payload,
      error: error instanceof Error ? error.message : String(error),
    })

    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  } finally {
    closeQuietly(sourceDb)
    closeQuietly(targetDb)
  }
}
