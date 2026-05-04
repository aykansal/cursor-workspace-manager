import { ChildProcess, spawn } from 'child_process'
import { EventEmitter } from 'events'
import path from 'path'
import { randomUUID } from 'crypto'
import { app } from 'electron'
import type { ServiceEvent, ServiceMessage, ServiceRequestMap, ServiceResponseMap, WorkspaceScanState } from './contracts'
import { logger } from './logger'

type PendingRequest = {
  resolve: (value: any) => void
  reject: (error: Error) => void
}

type WorkspaceServiceClientEvents = {
  scanState: [WorkspaceScanState]
}

export class WorkspaceServiceClient extends EventEmitter<WorkspaceServiceClientEvents> {
  private child: ChildProcess | null = null
  private readonly pendingRequests = new Map<string, PendingRequest>()
  private restartAttempts = 0
  private isShuttingDown = false
  private scanState: WorkspaceScanState = {
    status: 'idle',
    startedAt: null,
    completedAt: null,
    message: null,
  }

  start() {
    this.isShuttingDown = false
    this.spawn()
  }

  stop() {
    this.isShuttingDown = true
    const child = this.child
    this.child = null

    if (child && !child.killed) {
      child.kill()
    }

    for (const [id, pending] of this.pendingRequests) {
      pending.reject(new Error('Workspace service stopped'))
      this.pendingRequests.delete(id)
    }
  }

  getScanState(): WorkspaceScanState {
    return this.scanState
  }

  async request<K extends keyof ServiceRequestMap>(
    method: K,
    params: ServiceRequestMap[K]
  ): Promise<ServiceResponseMap[K]> {
    if (!this.child?.connected) {
      throw new Error('Workspace service is unavailable')
    }

    const id = randomUUID()
    const payload: ServiceMessage = {
      kind: 'request',
      id,
      method,
      params,
    }

    return new Promise<ServiceResponseMap[K]>((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject })
      this.child?.send(payload)
    })
  }

  private spawn() {
    const servicePath = this.getServiceProcessPath()
    const childEnv = {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      CURSOR_WORKSPACE_MANAGER_SERVICE_LOG: this.getServiceLogPath(),
      NODE_PATH: this.getServiceNodePath(),
    }

    logger.info('Starting workspace service process:', {
      execPath: process.execPath,
      servicePath,
      isPackaged: app?.isPackaged ?? false,
      logPath: childEnv.CURSOR_WORKSPACE_MANAGER_SERVICE_LOG,
      nodePath: childEnv.NODE_PATH,
    })

    const child = spawn(process.execPath, [servicePath], {
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      env: childEnv,
      windowsHide: true,
    })

    this.child = child

    child.stdout?.on('data', (chunk) => {
      logger.info(`[workspace-service stdout] ${String(chunk).trimEnd()}`)
    })

    child.stderr?.on('data', (chunk) => {
      logger.error(`[workspace-service stderr] ${String(chunk).trimEnd()}`)
    })

    child.on('message', (message: ServiceMessage) => {
      this.handleMessage(message)
    })

    child.once('error', (error) => {
      logger.error('Workspace service process failed to spawn:', {
        error: error.message,
        servicePath,
      })
    })

    child.once('exit', (code, signal) => {
      this.handleExit(code, signal)
    })
  }

  private getServiceProcessPath(): string {
    const bundledPath = path.join(__dirname, 'service-process.js')
    if (!app || !app.isPackaged) {
      return bundledPath
    }

    return bundledPath.replace('app.asar', 'app.asar.unpacked')
  }

  private getServiceLogPath(): string {
    const userDataPath = app?.getPath('userData')
    if (!userDataPath) {
      return path.join(process.cwd(), 'workspace-service.log')
    }

    return path.join(userDataPath, 'logs', 'workspace-service.log')
  }

  private getServiceNodePath(): string {
    const existing = process.env.NODE_PATH ? [process.env.NODE_PATH] : []

    if (!app || !app.isPackaged) {
      return existing.filter(Boolean).join(path.delimiter)
    }

    const packagedPaths = [
      path.join(process.resourcesPath, 'app.asar', 'node_modules'),
      path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules'),
    ]

    return [...packagedPaths, ...existing].filter(Boolean).join(path.delimiter)
  }

  private handleMessage(message: ServiceMessage) {
    if (message.kind === 'event') {
      this.handleEvent(message)
      return
    }

    if (message.kind !== 'response') return

    const pending = this.pendingRequests.get(message.id)
    if (!pending) return

    this.pendingRequests.delete(message.id)

    if (message.ok) {
      pending.resolve(message.result)
      return
    }

    pending.reject(new Error(message.error))
  }

  private handleEvent(event: ServiceEvent) {
    if (event.event !== 'scanState') return

    this.scanState = event.payload
    this.emit('scanState', event.payload)
  }

  private handleExit(code: number | null, signal: NodeJS.Signals | null) {
    this.child = null

    for (const [id, pending] of this.pendingRequests) {
      pending.reject(new Error('Workspace service exited unexpectedly'))
      this.pendingRequests.delete(id)
    }

    if (this.isShuttingDown) return

    logger.error('Workspace service exited unexpectedly:', { code, signal })

    this.scanState = {
      status: 'error',
      startedAt: this.scanState.startedAt,
      completedAt: new Date().toISOString(),
      message: 'Background workspace service exited unexpectedly. Restarting.',
    }
    this.emit('scanState', this.scanState)

    const delay = Math.min(1000 * 2 ** this.restartAttempts, 5000)
    this.restartAttempts += 1

    setTimeout(() => {
      if (this.isShuttingDown) return
      this.spawn()
    }, delay)
  }
}
