# AGENT.md

This file is for AI/code agents working in this repository. It is optimized for fast lookup, not narrative reading.

## Repo Identity

- Name: `cursor-workspace-manager`
- App type: Electron desktop app with a React renderer
- Purpose: inspect Cursor workspace storage on Windows, detect per-workspace chats, and transfer chat payloads between workspace hashes
- Runtime split:
  - Electron main process handles filesystem, SQLite, and IPC
  - Electron preload exposes a safe renderer API
  - React renderer displays workspace data and transfer controls

## Query-First Navigation

If you need to find something quickly, start with these queries.

- App shell / page composition:
  - `rg -n "useWorkspaceManager|ManagementStrip|WorkspaceTableCard|InspectorCard" src`
- Renderer state and orchestration:
  - `rg -n "loadWorkspaces|handleTransfer|selectedWorkspace|totalChats" src/features/workspace-manager`
- Workspace scanning / chat detection:
  - `rg -n "get-workspaces|getWorkspaceChats|chatPreviews|chatCount" electron`
- Transfer logic:
  - `rg -n "transfer-chats|sourceHash|targetHash|INSERT OR REPLACE" electron`
- Preload API surface:
  - `rg -n "contextBridge|electronAPI|getWorkspaces|transferChats|getChatPreview" electron`
- Search/filter behavior:
  - `rg -n "workspaceMatchesQuery|getProjectName|PAGE_SIZE" src/features/workspace-manager`
- Table / inspector UI:
  - `rg -n "Detected Chats|Rows per page|Source|Transfer" src/features/workspace-manager/components`
- Styling / layout:
  - `rg -n "workspace-scroll|bg-background|max-w-300" src`

## Top-Level Layout

- `electron/`
  - Main-process code and preload bridge
- `src/`
  - React renderer app
- `public/`
  - Static assets used by Vite
- `dist-electron/`
  - Built Electron output; generated, not source of truth
- `.agents/`
  - Local skill definitions and agent support files; not part of app runtime

## Source Of Truth By Concern

### Electron / system access

- `electron/main.ts`
  - Main process entry
  - Creates `BrowserWindow`
  - Reads Cursor workspace folders from `%APPDATA%/Cursor/User/workspaceStorage`
  - Opens `state.vscdb` with `better-sqlite3`
  - Detects chats per workspace
  - Handles chat transfer between source and target DBs
  - Registers IPC handlers:
    - `get-workspaces`
    - `transfer-chats`
    - `get-chat-preview`

- `electron/preload.ts`
  - Renderer-safe API exposed as `window.electronAPI`
  - Shared renderer-facing types:
    - `Workspace`
    - `TransferResult`

### React entrypoints

- `src/main.tsx`
  - React bootstrap
- `src/App.tsx`
  - Top-level layout
  - Wires hook state into cards/components

### Workspace-manager feature

Everything product-specific in the renderer is under:

- `src/features/workspace-manager/`

Breakdown:

- `hooks/use-workspace-manager.ts`
  - Main renderer orchestration layer
  - Loads workspaces from preload API
  - Holds selected source workspace
  - Handles transfer action
  - Computes totals, filtering, pagination, selected inspector state
  - If behavior feels “global” for the page, start here

- `lib/workspace-utils.ts`
  - Small pure helpers
  - Search matching
  - Page size
  - Project name derivation from a path

- `components/management-strip.tsx`
  - Top summary strip
  - Shows workspace count, total chats, filtered count, source lock state

- `components/workspace-table-card.tsx`
  - Main table of detected workspaces
  - Search input
  - Pagination
  - Source selection and transfer buttons

- `components/inspector-card.tsx`
  - Details panel for selected workspace
  - Shows selected hash, project, DB path, detected chats

- `components/transfer-status-alert.tsx`
  - Result banner after transfer

- `components/hero-card.tsx`
  - Present in repo but currently not mounted in `App.tsx`

### Shared UI primitives

- `src/components/ui/`
  - Local UI building blocks used by feature components
  - Includes `button`, `card`, `badge`, `alert`, `input`, `separator`, `table`

### Styling

- `src/index.css`
  - Global styling, tokens, utility-level app styles
  - Includes custom scroll styling such as `.workspace-scroll`

## Current Data Flow

1. Renderer mounts `App`
2. `useWorkspaceManager()` calls `window.electronAPI.getWorkspaces()`
3. Preload forwards IPC call to Electron main process
4. `electron/main.ts` scans Cursor workspace folders and SQLite DBs
5. Main process returns `Workspace[]`
6. Hook computes sorted, filtered, paged, selected views
7. UI renders summary strip, table, inspector, and transfer status

Transfer flow:

1. User selects a source workspace
2. User clicks `Transfer` on a target workspace row
3. Hook calls `window.electronAPI.transferChats(sourceHash, targetHash)`
4. Main process backs up both DBs to desktop
5. Main process copies known chat payload keys from source DB to target DB
6. Renderer reloads workspace list

## Current Chat Detection Model

Primary code:

- `electron/main.ts`

Current approach:

- Enumerates folders in `%APPDATA%/Cursor/User/workspaceStorage`
- Treats 32-char folder names as workspace hashes
- Opens each `state.vscdb`
- Scans `ItemTable` for keys related to chat/composer state
- Extracts chat preview labels into `chatPreviews`
- Uses `chatPreviews.length` as `chatCount`

Important current fields on `Workspace`:

- `hash`
- `projectPath`
- `chatCount`
- `chatPreviews`
- `lastModified`
- `dbPath`

If a future agent is debugging “folder detected but chats missing”, start in:

- `electron/main.ts`
  - `collectChatEntries`
  - `getWorkspaceChats`
  - `ipcMain.handle('get-workspaces', ...)`

## Current Transfer Model

Primary code:

- `electron/main.ts`

Current transfer copies these DB keys:

- `composer.composerData`
- `workbench.panel.aichat.view.aichat.chatdata`

Important limitation:

- Detection is broader than transfer
- Transfer still copies only the two known keys above
- If future work requires transferring all detected chat-related records, update transfer logic separately

## Fast File Map By Task

### “The UI layout looks wrong”

Read in this order:

- `src/App.tsx`
- `src/index.css`
- `src/features/workspace-manager/components/*.tsx`
- `src/components/ui/*.tsx`

### “Search/filter/pagination is wrong”

Read:

- `src/features/workspace-manager/hooks/use-workspace-manager.ts`
- `src/features/workspace-manager/lib/workspace-utils.ts`
- `src/features/workspace-manager/components/workspace-table-card.tsx`

### “Workspace count or total chats is wrong”

Read:

- `src/features/workspace-manager/hooks/use-workspace-manager.ts`
- `electron/main.ts`

### “Detected folders are correct but chat detection is wrong”

Read:

- `electron/main.ts`
- `electron/preload.ts`
- `src/features/workspace-manager/components/inspector-card.tsx`

### “Transfer works incorrectly or writes wrong data”

Read:

- `electron/main.ts`
- `src/features/workspace-manager/hooks/use-workspace-manager.ts`

### “A renderer type is missing or out of sync with backend data”

Read:

- `electron/preload.ts`
- all consumers in `src/features/workspace-manager/`

## Known Constraints And Caveats

- Windows-specific data source:
  - Workspace discovery depends on `%APPDATA%/Cursor/User/workspaceStorage`
- SQLite access:
  - Uses `better-sqlite3` directly in Electron main process
- Packaged entrypoint:
  - `package.json` points `main` to `dist-electron/main.js`
- Build output:
  - `dist-electron/` is generated; edit `electron/`, not `dist-electron/`
- Linting:
  - Repo has `.eslintrc.cjs`
  - `eslint` dependency is v9, so `npm run lint` currently fails unless config is migrated to flat config
- Transfer safety:
  - Backups are created on desktop under `Cursor-Backups`
  - Cursor should ideally be closed before transfer to reduce lock/stale-write risk

## Development Commands

- Install:
  - `pnpm install`
- Dev:
  - `pnpm dev`
- Type check + renderer build + Electron package:
  - `pnpm build`
- Type check only:
  - `npx tsc --noEmit`
- Lint:
  - `npm run lint`
  - currently blocked by ESLint 9 config mismatch

## Practical Editing Rules For Agents

- Prefer changing source files under `electron/` and `src/`
- Do not hand-edit `dist-electron/`
- When adding renderer-visible backend fields, update `electron/preload.ts` first
- For behavior spanning UI and backend:
  - start at `useWorkspaceManager.ts` for renderer flow
  - start at `electron/main.ts` for filesystem/DB flow
- For new workspace-manager UI, place it under `src/features/workspace-manager/components/`
- For small pure helpers, place them under `src/features/workspace-manager/lib/`

## Minimal Mental Model

- This is a single-feature app
- The single feature is “inspect Cursor workspaces and move chat payloads”
- Almost all product logic is in just three files:
  - `electron/main.ts`
  - `src/features/workspace-manager/hooks/use-workspace-manager.ts`
  - `src/App.tsx`

If an agent has to start blind, begin there.
