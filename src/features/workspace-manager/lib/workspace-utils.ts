import type { WorkspaceSummary } from '../../../../electron/preload'

export const PAGE_SIZE = 50

export function getProjectName(projectPath: string): string {
  return projectPath.split(/[/\\]/).pop() ?? ''
}

export function workspaceMatchesQuery(workspace: WorkspaceSummary, query: string): boolean {
  if (!query) return true

  const searchable = [
    workspace.hash,
    workspace.projectPath,
    getProjectName(workspace.projectPath),
    String(workspace.chatCount),
  ]
    .join(' ')
    .toLowerCase()

  return searchable.includes(query)
}
