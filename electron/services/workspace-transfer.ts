import fs from 'fs'
import os from 'os'
import path from 'path'
import type DatabaseType from 'better-sqlite3'
import type { TransferPayload, TransferResult } from '../contracts'
import { logger } from '../logger'
import { getTranscriptFilePath, getWorkspaceDbPath, getWorkspaceProjectPath, resolveTranscriptFilePath } from './cursor-paths'
import { Database } from './sqlite'
import { readComposerData, writeComposerData } from './workspace-index'

type ComposerData = {
  allComposers?: Array<Record<string, unknown>>
  [key: string]: unknown
}

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

    const sourceComposerData = readComposerData(sourceDb) as ComposerData
    const targetComposerData = readComposerData(targetDb) as ComposerData

    const sourceComposer = (sourceComposerData.allComposers ?? []).find((composer) => {
      if (!composer || typeof composer !== 'object') return false
      return (composer as Record<string, unknown>).composerId === payload.composerId
    })

    if (!sourceComposer) {
      return {
        success: false,
        error: `Selected chat ${payload.composerId} was not found in the source workspace.`,
      }
    }

    const targetHasComposer = (targetComposerData.allComposers ?? []).some((composer) => {
      if (!composer || typeof composer !== 'object') return false
      return (composer as Record<string, unknown>).composerId === payload.composerId
    })

    if (targetHasComposer) {
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
        const nextComposerData: ComposerData = {
          ...targetComposerData,
          allComposers: [...(targetComposerData.allComposers ?? []), sourceComposer as Record<string, unknown>],
        }

        writeComposerData(targetDb!, nextComposerData)
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
