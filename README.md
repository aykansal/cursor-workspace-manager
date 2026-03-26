# Cursor Workspace Manager

Desktop app for inspecting Cursor workspace storage and transferring chat data between workspace hashes.

Built with Electron + Vite + React + TypeScript, with SQLite access through better-sqlite3.

## What It Does

- Scans Cursor workspace storage in the current Windows profile.
- Lists detected workspaces with:
	- Workspace hash
	- Project path
	- Estimated chat count
	- Last modified timestamp
- Lets you select a source workspace and transfer chat payloads into a target workspace.
- Creates automatic backup copies of both source and target SQLite files before transfer.

## How It Works

- Cursor workspace root path:
	- `%APPDATA%/Cursor/User/workspaceStorage`
- Main process reads each workspace folder and opens `state.vscdb`.
- Transfer logic copies the following keys from source DB to target DB:
	- `composer.composerData`
	- `workbench.panel.aichat.view.aichat.chatdata`
- Backups are saved to:
	- `~/Desktop/Cursor-Backups`

## Tech Stack

- Electron 41
- Vite 6
- React 19
- TypeScript 5
- Tailwind CSS 4
- better-sqlite3

## Project Structure

```text
.
|- electron/
|  |- main.ts        # Electron main process and IPC handlers
|  |- preload.ts     # contextBridge API exposed to renderer
|- src/
|  |- App.tsx        # UI for listing and transferring workspaces
|  |- main.tsx       # React entrypoint
|- dist-electron/    # built main/preload output
|- public/
|- package.json
```

## Development

### Prerequisites

- Node.js 20+ recommended
- pnpm (workspace includes `pnpm-lock.yaml`)
- Cursor installed on Windows (for real data)

### Install

```bash
pnpm install
```

### Run In Dev Mode

```bash
pnpm dev
```

This runs Vite and starts the Electron app through the Vite Electron plugin.

## Build And Package

```bash
pnpm build
```

This command runs:

1. TypeScript compile check
2. Vite renderer build
3. Electron Builder packaging

Also available:

```bash
pnpm dist
```

## Security And Data Safety Notes

- The app modifies Cursor workspace SQLite data.
- Backup files are created automatically before each transfer.
- You should close Cursor before transferring chats to avoid file locks or stale writes.
- Use at your own risk and verify backups before deleting anything.

## Known Scope

- Current workspace discovery path is Windows-specific.
- The app expects Cursor workspace folder names with 32-character hashes.
- Chat count is estimated from stored composer/chat payload structure.

## License

No license is currently declared in this repository.
