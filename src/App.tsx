import { useState, useEffect } from 'react'
import type { Workspace, TransferResult } from '../electron/preload'

function App() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [sourceHash, setSourceHash] = useState<string | null>(null)
  const [status, setStatus] = useState('')

  const loadWorkspaces = async () => {
    const ws = await window.electronAPI.getWorkspaces()
    setWorkspaces(ws)
  }

  useEffect(() => {
    loadWorkspaces()
  }, [])

  const handleTransfer = async (targetHash: string) => {
    if (!sourceHash) return
    if (!confirm(`Transfer chats from ${sourceHash} → ${targetHash}?`)) return

    const res: TransferResult = await window.electronAPI.transferChats(sourceHash, targetHash)
    setStatus(res.success ? res.message! : `❌ ${res.error}`)
    setSourceHash(null)
    loadWorkspaces()
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-5xl font-bold mb-2 bg-linerar-to-r from-blue-400 to-violet-400 bg-clip-text text-transparent">
          Cursor Workspace Manager
        </h1>
        <p className="text-zinc-400 mb-8">View all workspaces • Transfer chats between any two hashes</p>

        <button
          onClick={loadWorkspaces}
          className="mb-6 px-6 py-3 bg-blue-600 hover:bg-blue-500 rounded-2xl font-medium transition-colors"
        >
          🔄 Refresh Workspaces
        </button>

        <div className="overflow-x-auto rounded-3xl border border-zinc-800 bg-zinc-900">
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="px-6 py-5 text-left">Project</th>
                <th className="px-6 py-5 text-left">Hash</th>
                <th className="px-6 py-5 text-left">Path</th>
                <th className="px-6 py-5 text-center">Chats</th>
                <th className="px-6 py-5 text-left">Last Modified</th>
                <th className="px-6 py-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {workspaces.map((w) => (
                <tr key={w.hash} className="border-b border-zinc-800 hover:bg-zinc-800/50 transition-colors">
                  <td className="px-6 py-5 font-medium">{w.projectPath.split(/[/\\]/).pop()}</td>
                  <td className="px-6 py-5 font-mono text-sm text-zinc-400">{w.hash}</td>
                  <td className="px-6 py-5 text-xs text-zinc-500 truncate max-w-md">{w.projectPath}</td>
                  <td className="px-6 py-5 text-center font-medium">{w.chatCount}</td>
                  <td className="px-6 py-5 text-sm">{w.lastModified ? new Date(w.lastModified).toLocaleString() : '-'}</td>
                  <td className="px-6 py-5 text-right space-x-3">
                    <button
                      onClick={() => setSourceHash(w.hash)}
                      className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-sm font-medium"
                    >
                      Select Source
                    </button>
                    <button
                      onClick={() => handleTransfer(w.hash)}
                      className="px-5 py-2 bg-violet-600 hover:bg-violet-500 rounded-xl text-sm font-medium"
                    >
                      Transfer Here
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {status && (
          <div className="mt-8 p-6 bg-zinc-900 border border-zinc-700 rounded-3xl text-lg">
            {status}
          </div>
        )}
      </div>
    </div>
  )
}

export default App