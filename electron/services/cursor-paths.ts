import fs from 'fs'
import os from 'os'
import path from 'path'
import { readJsonFile } from './shared'

type WorkspaceFile = {
  folder?: string
}

export function getAppDataPath(): string {
  return process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming')
}

export function getWorkspaceStoragePath(): string {
  return path.join(getAppDataPath(), 'Cursor', 'User', 'workspaceStorage')
}

export function getWorkspaceDir(hash: string): string {
  return path.join(getWorkspaceStoragePath(), hash)
}

export function getWorkspaceDbPath(hash: string): string {
  return path.join(getWorkspaceDir(hash), 'state.vscdb')
}

export function getWorkspaceJsonPath(hash: string): string {
  return path.join(getWorkspaceDir(hash), 'workspace.json')
}

export function toCursorProjectSlug(projectPath: string): string {
  return projectPath
    .replace(/\\/g, '/')
    .replace(/^([a-zA-Z]):/, (_, drive: string) => drive.toLowerCase())
    .split('/')
    .filter(Boolean)
    .map((segment) => segment.replace(/[^a-zA-Z0-9.-]+/g, '-').replace(/-+/g, '-'))
    .join('-')
}

export function getWslRemoteInfo(projectPath: string): { distro: string; linuxPath: string } | null {
  if (projectPath.startsWith('vscode-remote://wsl+')) {
    const match = projectPath.match(/^vscode-remote:\/\/wsl\+([^/]+)(\/.*)$/)
    if (!match) return null

    return {
      distro: decodeURIComponent(match[1]),
      linuxPath: match[2],
    }
  }

  if (projectPath.startsWith('file://wsl.localhost/')) {
    const match = projectPath.match(/^file:\/\/wsl\.localhost\/([^/]+)(\/.*)$/)
    if (!match) return null

    return {
      distro: decodeURIComponent(match[1]),
      linuxPath: match[2],
    }
  }

  return null
}

export function getCursorProjectRoots(projectPath: string): string[] {
  const roots = [path.join(os.homedir(), '.cursor', 'projects')]
  const wslInfo = getWslRemoteInfo(projectPath)

  if (wslInfo) {
    const segments = wslInfo.linuxPath.split('/').filter(Boolean)
    if (segments[0] === 'home' && segments[1]) {
      roots.unshift(
        path.win32.join(
          `\\\\wsl.localhost\\${wslInfo.distro}`,
          'home',
          segments[1],
          '.cursor',
          'projects'
        )
      )
    }
  }

  return [...new Set(roots)]
}

export function getTranscriptFilePath(projectPath: string, composerId: string): string {
  const normalizedProjectPath = getWslRemoteInfo(projectPath)?.linuxPath ?? projectPath

  return path.join(
    getCursorProjectRoots(projectPath)[0],
    toCursorProjectSlug(normalizedProjectPath),
    'agent-transcripts',
    composerId,
    `${composerId}.jsonl`
  )
}

export function resolveTranscriptFilePath(projectPath: string, composerId: string): string {
  const directPath = getTranscriptFilePath(projectPath, composerId)
  if (fs.existsSync(directPath)) return directPath

  for (const projectsRoot of getCursorProjectRoots(projectPath)) {
    if (!fs.existsSync(projectsRoot)) continue

    for (const projectDir of fs.readdirSync(projectsRoot, { withFileTypes: true })) {
      if (!projectDir.isDirectory()) continue

      const candidate = path.join(
        projectsRoot,
        projectDir.name,
        'agent-transcripts',
        composerId,
        `${composerId}.jsonl`
      )

      if (fs.existsSync(candidate)) {
        return candidate
      }
    }
  }

  return directPath
}

export function getWorkspaceProjectPath(hash: string): string {
  const workspaceJsonPath = getWorkspaceJsonPath(hash)
  if (!fs.existsSync(workspaceJsonPath)) {
    return 'Unknown'
  }

  const data = readJsonFile<WorkspaceFile>(workspaceJsonPath)

  if (!data) {
    return 'Unknown'
  }

  if (!data.folder) {
    return 'Multi-folder workspace'
  }

  return decodeURIComponent(data.folder.replace('file:///', ''))
}
