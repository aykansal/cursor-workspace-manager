#!/usr/bin/env node
const fs = require('fs')
const path = require('path')
const os = require('os')
const { createRequire } = require('module')
const requireC = createRequire(__filename)
const Database = requireC('better-sqlite3')

function getAppDataPath() {
  return process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming')
}

function getWorkspaceStoragePath() {
  return path.join(getAppDataPath(), 'Cursor', 'User', 'workspaceStorage')
}

function getWorkspaceDir(hash) {
  return path.join(getWorkspaceStoragePath(), hash)
}

function getWorkspaceDbPath(hash) {
  return path.join(getWorkspaceDir(hash), 'state.vscdb')
}

function getWorkspaceJsonPath(hash) {
  return path.join(getWorkspaceDir(hash), 'workspace.json')
}

function getWorkspaceProjectPath(hash) {
  const workspaceJsonPath = getWorkspaceJsonPath(hash)
  if (!fs.existsSync(workspaceJsonPath)) return 'Unknown'

  try {
    const data = JSON.parse(fs.readFileSync(workspaceJsonPath, 'utf8'))
    if (!data.folder) return 'Multi-folder workspace'
    return decodeURIComponent(String(data.folder).replace('file:///', ''))
  } catch {
    return 'Unknown'
  }
}

function toCursorProjectSlug(projectPath) {
  return projectPath
    .replace(/\\/g, '/')
    .replace(/^([a-zA-Z]):/, (_, drive) => drive.toLowerCase())
    .split('/')
    .filter(Boolean)
    .map((segment) => segment.replace(/[^a-zA-Z0-9.-]+/g, '-').replace(/-+/g, '-'))
    .join('-')
}

function getCursorProjectRoots(projectPath) {
  const roots = [path.join(os.homedir(), '.cursor', 'projects')]
  if (projectPath.startsWith('vscode-remote://wsl+')) {
    const match = projectPath.match(/^vscode-remote:\/\/wsl\+([^/]+)(\/.*)$/)
    if (match) {
      const distro = decodeURIComponent(match[1])
      const linuxPath = match[2]
      const segments = linuxPath.split('/').filter(Boolean)
      if (segments[0] === 'home' && segments[1]) {
        roots.unshift(path.win32.join(`\\\\wsl.localhost\\${distro}`, 'home', segments[1], '.cursor', 'projects'))
      }
    }
  }
  return [...new Set(roots)]
}

function readComposerPaneIds(db) {
  const rows = db
    .prepare("SELECT key, value FROM ItemTable WHERE key LIKE 'workbench.panel.composerChatViewPane.%' ORDER BY key")
    .all()

  const ids = new Set()
  for (const row of rows) {
    if (!row.value) continue
    try {
      const parsed = JSON.parse(row.value)
      for (const viewKey of Object.keys(parsed)) {
        const prefix = 'workbench.panel.aichat.view.'
        if (viewKey.startsWith(prefix)) ids.add(viewKey.slice(prefix.length))
      }
    } catch {
      // ignore malformed values
    }
  }
  return [...ids]
}

function verifyWorkspaceHash(hash) {
  const dbPath = getWorkspaceDbPath(hash)
  const projectPath = getWorkspaceProjectPath(hash)
  const dbExists = fs.existsSync(dbPath)
  const projectRoots = getCursorProjectRoots(projectPath)
  const slug = toCursorProjectSlug(projectPath)
  const transcriptRoot = path.join(projectRoots[0], slug, 'agent-transcripts')

  console.log('--- workspace', hash)
  console.log('projectPath:', projectPath)
  console.log('dbExists:', dbExists, dbPath)
  console.log('transcriptRoot:', transcriptRoot, fs.existsSync(transcriptRoot))

  if (!dbExists) {
    console.log('skip: missing DB')
    return
  }

  const db = new Database(dbPath, { readonly: true })
  try {
    const ids = readComposerPaneIds(db)
    console.log('composerIds:', ids.length, ids.join(', '))
    for (const id of ids) {
      const transcriptFile = path.join(transcriptRoot, id, `${id}.jsonl`)
      const exists = fs.existsSync(transcriptFile)
      let lineCount = 0
      let firstLine = ''
      if (exists) {
        const content = fs.readFileSync(transcriptFile, 'utf8')
        lineCount = content.split(/\r?\n/).filter(Boolean).length
        firstLine = content.split(/\r?\n/).find(Boolean) || ''
      }
      console.log(JSON.stringify({ id, exists, transcriptFile, lineCount, firstLine: firstLine.slice(0, 160) }))
    }
  } finally {
    try {
      db.close()
    } catch {}
  }
}

const target = process.argv[2]
if (!target) {
  console.error('Usage: node tools/verify-transcript-fetch.js <workspace-hash-or-workspace-path>')
  process.exit(2)
}

const candidateHash = /^[0-9a-f]{32}$/i.test(target) ? target : null
if (candidateHash) {
  verifyWorkspaceHash(candidateHash)
} else {
  const root = getWorkspaceStoragePath()
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const workspaceJson = getWorkspaceJsonPath(entry.name)
    if (!fs.existsSync(workspaceJson)) continue
    try {
      const data = JSON.parse(fs.readFileSync(workspaceJson, 'utf8'))
      const folder = data.folder ? decodeURIComponent(String(data.folder).replace('file:///', '')) : ''
      if (folder.toLowerCase().includes(target.toLowerCase())) {
        verifyWorkspaceHash(entry.name)
      }
    } catch {}
  }
}
